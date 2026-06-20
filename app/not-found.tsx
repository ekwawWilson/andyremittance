import Link from 'next/link';

export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Arial, sans-serif', background: '#f9fafb' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ fontSize: '72px', fontWeight: 900, color: '#1e3a8a' }}>404</div>
          <div style={{ fontSize: '20px', fontWeight: 600, color: '#374151' }}>Page not found</div>
          <Link href="/" style={{ color: '#2563eb', textDecoration: 'underline', fontSize: '14px' }}>
            Return to home
          </Link>
        </div>
      </body>
    </html>
  );
}
