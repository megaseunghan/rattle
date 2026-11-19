import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { createEvidencePurgeHandler, verifyPurgeSignature } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const bucket = admin.storage.from('transaction-evidence');
const signingSecret = Deno.env.get('EVIDENCE_PURGE_TOKEN');

async function removePath(path: string) {
  let outcome = 'unknown';
  try {
    const { data, error } = await bucket.remove([path]);
    if (error) outcome = 'failed';
    else if (data?.length === 1 && data[0].name === path) outcome = 'confirmed';
  } catch {
    // A lost response can follow a committed Storage metadata delete.
  }
  const { error } = await admin.rpc('record_evidence_purge_result', { p_path: path, p_outcome: outcome });
  return !error && outcome === 'confirmed';
}

Deno.serve(createEvidencePurgeHandler({
  verify: token => verifyPurgeSignature(token, signingSecret),
  claim: async () => {
    const { data, error } = await admin.rpc('claim_expired_evidence_paths');
    if (error) throw error;
    return data;
  },
  remove: async paths => {
    let complete = true;
    for (let i = 0; i < paths.length; i += 8) {
      const results = await Promise.allSettled(paths.slice(i, i + 8).map(removePath));
      if (results.some(r => r.status === 'rejected' || !r.value)) complete = false;
    }
    if (!complete) throw new Error('EVIDENCE_PURGE_INCOMPLETE');
  },
}));
