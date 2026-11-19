// Static check, no database. RLS 정책 식의 auth.uid()/jwt()/role()/email()은 (SELECT auth.<fn>())로 감싼다.
// 감싸지 않으면 행마다 다시 계산된다(Supabase Advisor: auth_rls_initplan).
// baseline 파일들은 20261118121000_rls_auth_initplan.sql이 적용 시점에 보정했다. 새 파일은 처음부터 감싸야 한다.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const dir = new URL('../supabase/migrations/', import.meta.url);
const baseline = new Set(JSON.parse(await readFile(new URL('./rls-auth-wrapping-baseline.json', import.meta.url), 'utf8')).files);
const bare = /(?<!select\s+)\bauth\.(uid|jwt|role|email)\s*\(\s*\)/i;
/** CREATE/ALTER POLICY 문(동적 EXECUTE 문자열 포함)에서 감싸지 않은 auth 호출이 있는 정책 이름 목록 */
export function unwrappedPolicies(sql) {
  const text = sql.replace(/--[^\n]*/g, ' ');
  const found = [];
  for (const m of text.matchAll(/\b(?:create|alter)\s+policy\s+("[^"]+"|%I|\S+)[\s\S]*?(?:;|'\s*,|\$\$)/gi)) {
    if (bare.test(m[0])) found.push(m[1].replace(/"/g, ''));
  }
  return found;
}
assert.deepEqual(unwrappedPolicies('CREATE POLICY a ON t FOR SELECT USING (user_id = auth.uid());'), ['a']);
assert.deepEqual(unwrappedPolicies('CREATE POLICY "b c" ON t USING (x) WITH CHECK (auth.jwt() ->> \'sub\' = id::text);'), ['b c']);
assert.deepEqual(unwrappedPolicies('CREATE POLICY a ON t USING (user_id = (select auth.uid()));'), []);
assert.deepEqual(unwrappedPolicies('CREATE POLICY a ON t USING (user_id = ( SELECT auth.uid() AS uid));'), []);
assert.deepEqual(unwrappedPolicies('CREATE POLICY a ON t USING (is_store_member(store_id));\nSELECT auth.uid();'), []);
assert.deepEqual(unwrappedPolicies('-- CREATE POLICY old ON t USING (auth.uid() = x);'), []);

const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
// Imported historical files are already deployed and immutable. Only these exact bytes
// may rely on the ordered forward repair; do not extend the old baseline.
const repairedHistoricalFiles = new Map([
  ['20261114025150_transaction_evidence.sql', '34ad706fccee4f6841e452530d6674602503ae1bb8442e1a5cdae532929e3d8b'],
  ['20261103180000_home_alert_undo.sql', '8636739a331c03b2475150028edbdea5569696468c12f74c3927c9c4faaca1ad'],
  ['20261117150000_role_model_core.sql', '36f6f4fbc11eb397599d7be37053542dc05e8e18e19410962a30be0413bedc4d'],
  ['20261117160000_store_visibility.sql', '31d14a9ebf79314f1f92e50cecb1c93560ed1014876d5db1e71805d5047851a7'],
  ['20261117170000_manager_rpc_policy.sql', 'f9ef7eb3628c8bf0d851e341968738a01176aeaabe0dbe05c1588b124b22ad45'],
]);
const repairName = '20261119120000_release_rls_auth_initplan.sql';
const repair = await readFile(new URL(repairName, dir), 'utf8');
const original = await readFile(new URL('20261118121000_rls_auth_initplan.sql', dir), 'utf8');
assert.ok(repair.endsWith(original), 'forward repair must preserve the verified initPlan transformation');
const offenders = [];
for (const file of files) {
  if (baseline.has(file)) continue;
  const sql = await readFile(new URL(file, dir), 'utf8');
  if (repairedHistoricalFiles.has(file)) {
    assert.equal(createHash('sha256').update(sql).digest('hex'), repairedHistoricalFiles.get(file), `${file}: immutable deployed file changed`);
    assert.ok(file < repairName, 'repair must run after the imported policy');
    continue;
  }
  const policies = unwrappedPolicies(sql);
  if (policies.length) offenders.push(`${file}: ${policies.join(', ')}`);
}
if (process.argv.includes('--print-offending-files')) {
  for (const file of files) if (unwrappedPolicies(await readFile(new URL(file, dir), 'utf8')).length) console.log(file);
  process.exit(0);
}
assert.deepEqual(offenders, [], `RLS 정책에서 auth 호출을 (select auth.uid())처럼 감싸 주세요:\n${offenders.join('\n')}`);
console.log(`RLS auth wrapping: ${files.length - baseline.size} migration files checked, ${baseline.size} pre-fix files in baseline`);
