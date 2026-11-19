import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createEvidencePurgeHandler } from './handler.ts';
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
Deno.serve(createEvidencePurgeHandler({
  token: Deno.env.get('EVIDENCE_PURGE_TOKEN'),
  claim: async () => {
    const { data, error } = await admin.rpc('claim_expired_evidence_paths');
    if (error) throw error;
    return data;
  },
  remove: async paths => {
    const { error } = await admin.storage.from('transaction-evidence').remove(paths);
    if (error) throw error;
  },
}));
