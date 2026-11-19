import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
    const { data,error } = await admin.storage.from('transaction-evidence').createSignedUrl(path,ttl);
    if (error) throw error;
    return data.signedUrl;
  },
}));
