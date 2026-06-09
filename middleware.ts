import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from '@/lib/auth/jwt';

// ─── Security headers ─────────────────────────────────────────────────────────

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );
  return response;
}

// ─── Rate limiter (login only) ────────────────────────────────────────────────
// NOTE: This is an in-process Map — counts reset when the server restarts.
// For production with multiple instances, replace with an atomic Redis counter
// (e.g. @upstash/ratelimit).  Periodic eviction below prevents unbounded growth.

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS    = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const EVICT_INTERVAL_MS  = 5 * 60 * 1000; // clean up expired entries every 5 minutes
let lastEvictAt = Date.now();

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();

  // Evict stale entries to prevent the map growing indefinitely
  if (now - lastEvictAt > EVICT_INTERVAL_MS) {
    for (const [key, val] of loginAttempts) {
      if (now > val.resetAt) loginAttempts.delete(key);
    }
    lastEvictAt = now;
  }

  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

// ─── Portal access matrix ─────────────────────────────────────────────────────
// Duplicated from lib/auth/roles.ts because middleware runs in Edge runtime
// and cannot safely import Node-side modules.

const PORTAL_ACCESS: Record<string, string[]> = {
  SUPER_ADMIN:     ['sending', 'receiving', 'admin'],
  ADMIN:           ['sending', 'admin'],
  SENDING_ADMIN:   ['sending', 'admin'],
  SENDING_AGENT:   ['sending'],
  RECEIVING_ADMIN: ['receiving', 'admin'],
  MANAGER:         ['receiving', 'admin'],
  TELLER:          ['receiving'],
};

function homePortalPath(role: string): string {
  const portals = PORTAL_ACCESS[role] ?? ['sending'];
  if (portals.includes('sending'))   return '/sending';
  if (portals.includes('receiving')) return '/receiving';
  return '/admin';
}

function canAccessPortal(role: string, portal: string): boolean {
  return (PORTAL_ACCESS[role] ?? []).includes(portal);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── API routes ──────────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {

    // Login: rate-limit only, no JWT required
    if (pathname.startsWith('/api/auth/login')) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
        request.headers.get('x-real-ip') ??
        'unknown';

      if (!checkLoginRateLimit(ip)) {
        const res = NextResponse.json(
          { success: false, error: 'Too many login attempts. Try again in 15 minutes.' },
          { status: 429 }
        );
        res.headers.set('Retry-After', '900');
        return addSecurityHeaders(res);
      }

      return addSecurityHeaders(NextResponse.next());
    }

    // All other API routes: require valid JWT
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
      );
    }

    const payload = await verifyJWT(token);
    if (!payload) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Invalid or expired token' }, { status: 401 })
      );
    }

    // Inject user context into downstream route headers
    const reqHeaders = new Headers(request.headers);
    reqHeaders.set('x-user-id',    payload.userId);
    reqHeaders.set('x-user-email', payload.email);
    reqHeaders.set('x-user-role',  payload.role);
    if (payload.receivingPointId) {
      reqHeaders.set('x-receiving-point-id', payload.receivingPointId);
    }

    // API-level portal access guard
    // Block access to portal-specific API routes if the role isn't allowed.
    // Use trailing-slash segments to avoid /api/receiving matching /api/receiving-points.
    const apiPortalPrefixes: Record<string, string> = {
      '/api/sending/':   'sending',
      '/api/receiving/': 'receiving',
      '/api/admin/':     'admin',
    };
    for (const [prefix, portal] of Object.entries(apiPortalPrefixes)) {
      if (pathname.startsWith(prefix) && !canAccessPortal(payload.role, portal)) {
        return addSecurityHeaders(
          NextResponse.json({ success: false, error: 'Access denied to this portal' }, { status: 403 })
        );
      }
    }

    return addSecurityHeaders(
      NextResponse.next({ request: { headers: reqHeaders } })
    );
  }

  // ── Page routes: portal access guard ────────────────────────────────────────
  // Since the JWT lives in localStorage (not cookies) we cannot read it in
  // middleware.  The DashboardLayout component handles the client-side redirect.
  // However we can forward a custom header `x-portal-home` so pages can read it.
  // (No-op for now — client guard in DashboardLayout is the enforcement point.)

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
};
