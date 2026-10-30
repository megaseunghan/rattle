// Loopback-only session broker. Test passwords remain on this Mac, outside app bundles.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const config = JSON.parse(await readFile(new URL('../../.qa/accounts.json', import.meta.url), 'utf8'));
const roles = ['admin', 'regular', 'part_time'];
function authorized(value) {
  const actual = Buffer.from(value ?? '');
  const expected = Buffer.from(`Bearer ${config.brokerToken}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  const finish = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
  if (req.headers.origin || req.method !== 'POST' || req.url !== '/session' || !authorized(req.headers.authorization)) {
    finish(403, { error: 'Forbidden' }); return;
  }
  try {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 256) { finish(413, { error: 'Too large' }); return; } }
    const { role } = JSON.parse(body);
    if (!roles.includes(role)) { finish(400, { error: 'Invalid role' }); return; }
    const client = createClient(config.projectUrl, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email: config.accounts[role].email, password: config.accounts[role].password });
    if (error || data.user?.id !== config.accounts[role].id || data.user.app_metadata.qa_fixture !== config.storeId) throw new Error('QA auth failed');
    const membership = await client.from('store_members').select('role,status').eq('store_id', config.storeId).eq('user_id', data.user.id).single();
    if (membership.error || membership.data.status !== 'approved' || membership.data.role !== (role === 'admin' ? 'admin' : 'member')) throw new Error('QA membership mismatch');
    if (role !== 'admin') {
      const employee = await client.from('employees').select('employment_type').eq('store_id', config.storeId).eq('user_id', data.user.id).eq('is_active', true).single();
      if (employee.error || employee.data.employment_type !== role) throw new Error('QA employee mismatch');
    }
    finish(200, { projectUrl: config.projectUrl, storeId: config.storeId, session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
    console.log(`QA session issued: ${role}`);
  } catch { finish(502, { error: 'QA login failed; check fixture accounts and connection' }); }
});
server.requestTimeout = 20_000;
server.listen(18765, '127.0.0.1', () => console.log('Rattle QA broker listening on loopback port 18765'));
