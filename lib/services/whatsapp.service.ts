/**
 * WAHA (WhatsApp HTTP API) notification helper.
 *
 * WAHA is a self-hosted Docker container that exposes a REST API for WhatsApp Web.
 * It supports sending to both individual numbers and group chats.
 *
 * Required env vars:
 *   WAHA_API_URL   – base URL of your WAHA container, e.g. http://localhost:3001
 *   WAHA_SESSION   – WAHA session name (default: "default")
 *   WAHA_CHAT_ID   – WhatsApp chat ID to send to
 *                    • Individual: "12345678901@c.us"  (phone number without +)
 *                    • Group:      "120363XXXXXXXXXX@g.us"
 *
 * Optional env vars:
 *   WAHA_API_KEY   – API key if WAHA is started with --env WHATSAPP_API_KEY=...
 *                    (WAHA Plus or custom security config)
 *
 * Leave all WAHA_* vars unset to disable notifications silently.
 *
 * Docker quick-start (free WAHA Core edition):
 *   docker run -d --name waha -p 3001:3000 devlikeapro/waha
 *
 * Then start a session and scan the QR code:
 *   POST http://localhost:3001/api/sessions/start  { "name": "default" }
 *   GET  http://localhost:3001/api/screenshot       ← shows QR code image
 *
 * Get group chat ID after linking:
 *   GET http://localhost:3001/api/default/chats     ← list all chats; find your group
 */

interface WahaEnv {
  apiUrl: string;
  session: string;
  chatId: string;
  apiKey?: string;
}

function getEnv(): WahaEnv | null {
  const apiUrl = process.env.WAHA_API_URL?.replace(/\/$/, '');
  const session = process.env.WAHA_SESSION || 'default';
  const chatId = process.env.WAHA_CHAT_ID;

  if (!apiUrl || !chatId) return null;

  return {
    apiUrl,
    session,
    chatId,
    apiKey: process.env.WAHA_API_KEY || undefined,
  };
}

/**
 * Send a plain-text WhatsApp message via WAHA.
 * Returns silently on any error so callers never need to handle failures.
 */
export async function sendWhatsAppNotification(text: string): Promise<void> {
  const env = getEnv();
  if (!env) return; // env not configured — skip silently

  try {
    const url = `${env.apiUrl}/api/sendText`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (env.apiKey) {
      headers['X-Api-Key'] = env.apiKey;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        session: env.session,
        chatId: env.chatId,
        text,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn('[WAHA] send failed:', res.status, err);
    }
  } catch (error) {
    console.warn('[WAHA] send error:', error);
  }
}
