import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
const config = JSON.parse(await readFile(new URL('../../.qa/accounts.json', import.meta.url), 'utf8'));
for (const [role, account] of Object.entries(config.accounts)) {
  const client = createClient(config.projectUrl, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.equal(auth.error, null, `${role} auth`);
  assert.equal(auth.data.user.id, account.id);
  const stores = await client.from('stores').select('id,name');
  assert.equal(stores.error, null);
  assert.deepEqual(stores.data.map(s => s.id), [config.storeId], `${role}: only fixture store visible`);
  const employees = await client.from('employees').select('id,employment_type,user_id').eq('store_id', config.storeId);
  assert.equal(employees.error, null);
  if (role !== 'admin') {
    assert.equal(employees.data.length, 1, `${role}: only own employee visible`);
    assert.equal(employees.data[0].id, account.employeeId);
    assert.equal(employees.data[0].employment_type, role);
    const payroll = await client.from('payroll').select('employee_id').eq('store_id', config.storeId);
    assert.equal(payroll.error, null);
    assert.ok(payroll.data.length > 0, `${role}: own demo payroll visible`);
    assert.ok(payroll.data.every(p => p.employee_id === account.employeeId), `${role}: other payroll hidden`);
    const invite = await client.rpc('get_or_create_store_invite_code', { p_store_id: config.storeId });
    assert.ok(invite.error, `${role}: admin invite issuance denied`);
  } else assert.ok(employees.data.length >= 2, 'admin: fixture employee list visible');
  console.log(`PASS ${role}: real account, store isolation, ${employees.data.length} visible employee(s)${role === 'admin' ? '' : ', own payroll only, admin RPC denied'}`);
}
const denied = await fetch('http://127.0.0.1:18765/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"role":"admin"}' });
assert.equal(denied.status, 403, 'Unauthenticated broker call denied');
const browser = await fetch('http://127.0.0.1:18765/session', { method: 'POST', headers: { Origin: 'https://example.com', Authorization: `Bearer ${config.brokerToken}` }, body: '{"role":"admin"}' });
assert.equal(browser.status, 403, 'Browser origin denied even with token');
console.log('PASS broker: missing capability and browser Origin denied');
