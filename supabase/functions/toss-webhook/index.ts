import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createTossWebhookHandler } from './handler.ts';
const secret = Deno.env.get('TOSS_WEBHOOK_SECRET') ?? '';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
serve(createTossWebhookHandler({
  verify: async (timestamp, raw, signature) => {
    if (!secret) throw new Error('webhook_configuration_missing');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`));
    const expected = `v1=${Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
    if (signature.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < signature.length; i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  },
  process: async (id, type, merchantId, event) => {
    const { data, error } = await admin.rpc('process_toss_webhook', { p_event_id: id, p_event_type: type, p_merchant_id: merchantId, p_event: event });
    if (error || !data || typeof data.duplicated !== 'boolean') throw new Error('webhook_transaction_failed');
    return data;
  },
  report: event => console.error(JSON.stringify({ event })),
}));
