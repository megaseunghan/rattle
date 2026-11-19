import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { createEvidenceSignHandler } from './handler.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
Deno.serve(createEvidenceSignHandler({
  readyProof: async (authorization,id) => {
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data, error } = await caller.from('transaction_evidence').select('id,store_id,mime_type')
      .eq('id', id).eq('status','ready').maybeSingle();
    if (error) throw error;
    return data;
  },
  sign: async (path,ttl) => {
    const bucket = admin.storage.from('transaction-evidence');
    const info = await bucket.info(path);
    if (info.error) throw info.error;
    // Accept only the canonical policy from a cacheControl: '0' upload.
    if (info.data.cacheControl?.trim().toLowerCase() !== 'max-age=0') {
      return null;
    }
    const { data,error } = await bucket.createSignedUrl(path,ttl);
    if (error) throw error;
    return data.signedUrl;
  },
}));
