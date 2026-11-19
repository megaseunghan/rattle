// Static check, no database. RLS 정책 식의 auth.uid()/jwt()/role()/email()은 (SELECT auth.<fn>())로 감싼다.
// 감싸지 않으면 행마다 다시 계산된다(Supabase Advisor: auth_rls_initplan).
// baseline 파일들은 20261118120000_rls_auth_initplan.sql이 적용 시점에 보정했다. 새 파일은 처음부터 감싸야 한다.
import assert from 'node:assert/strict';
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
const offenders = [];
for (const file of files) {
  if (baseline.has(file)) continue;
  const policies = unwrappedPolicies(await readFile(new URL(file, dir), 'utf8'));
  if (policies.length) offenders.push(`${file}: ${policies.join(', ')}`);
}
if (process.argv.includes('--print-offending-files')) {
  for (const file of files) if (unwrappedPolicies(await readFile(new URL(file, dir), 'utf8')).length) console.log(file);
  process.exit(0);
}
assert.deepEqual(offenders, [], `RLS 정책에서 auth 호출을 (select auth.uid())처럼 감싸 주세요:\n${offenders.join('\n')}`);
console.log(`RLS auth wrapping: ${files.length - baseline.size} migration files checked, ${baseline.size} pre-fix files in baseline`);
