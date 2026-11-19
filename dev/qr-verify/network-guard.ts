export let supabaseCalls = 0;
function forbidden() { supabaseCalls++; throw new Error('Offline UI verification forbids Supabase access'); }
export const supabase = { from: forbidden, rpc: forbidden, functions: { invoke: forbidden }, auth: { getSession: forbidden, getUser: forbidden, signInWithPassword: forbidden, onAuthStateChange: forbidden } };
