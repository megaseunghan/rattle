interface WebhookEvent {
  id?: unknown;
  type?: unknown;
  merchantId?: unknown;
  data?: { merchant?: { id?: unknown } };
}
interface Dependencies {
  verify: (timestamp: string, raw: string, signature: string) => Promise<boolean>;
  process: (eventId: string, type: string, merchantId: string, event: WebhookEvent) => Promise<{ duplicated: boolean }>;
  report: (code: string) => void;
}
export function createTossWebhookHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const raw = await req.text();
    if (raw.length > 1000000) return json({ code: 'EVENT_TOO_LARGE' }, 413);
    const signature = req.headers.get('x-toss-signature') ?? '';
    const timestamp = req.headers.get('x-toss-timestamp') ?? '';
    try {
      if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) {
        return json({ code: 'STALE_SIGNATURE' }, 401);
      }
      if (!signature || !timestamp || !await deps.verify(timestamp, raw, signature)) return json({ code: 'INVALID_SIGNATURE' }, 401);
      let event: WebhookEvent;
      try { event = JSON.parse(raw); } catch { return json({ code: 'INVALID_EVENT' }, 400); }
      if (!event || typeof event !== 'object' || Array.isArray(event)) return json({ code: 'INVALID_EVENT' }, 400);
      const id = event.id;
      const type = event.type;
      const merchantId = event.merchantId ?? event.data?.merchant?.id;
      if (typeof id !== 'string' || !id.trim() || id.length > 200 || typeof type !== 'string' || !type.trim() || type.length > 200) {
        return json({ code: 'INVALID_EVENT' }, 400);
      }
      if (req.headers.get('x-toss-webhook-id') !== id) return json({ code: 'INVALID_EVENT' }, 400);
      if (!['app.installation.created.v1', 'app.installation.deleted.v1'].includes(type)) return json({ received: true, ignored: true });
      if ((typeof merchantId !== 'string' && typeof merchantId !== 'number') || !String(merchantId).trim() || String(merchantId).length > 200) {
        return json({ code: 'INVALID_EVENT' }, 400);
      }
      const result = await deps.process(id, type, String(merchantId), event);
      return json({ received: true, duplicated: result.duplicated });
    } catch {
      deps.report('toss_webhook_failed');
      return json({ code: 'PROCESSING_FAILED' }, 500);
    }
  };
}
