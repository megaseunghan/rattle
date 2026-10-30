// Explicit, manual fixture setup: only the existing 래틀 demo store and its virtual employees.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');
const cli = process.argv[2] ?? 'supabase';
const ref = 'galrnwpiaedtahoupbgo';
const storeId = '7a771e00-1026-4000-8000-000000000001';
const fixtures = {
  admin: { name: 'QA 관리자', employeeId: null },
  regular: { name: '김하늘', employeeId: '0fe7a761-d965-4af7-b367-98f3806974dc' },
  part_time: { name: '정지우', employeeId: 'e06070c8-ccbe-4596-b0c4-e461d7b152c3' },
};
const path = new URL('../../.qa/accounts.json', import.meta.url);
await mkdir(new URL('../../.qa/', import.meta.url), { recursive: true, mode: 0o700 });
const run = args => JSON.parse(execFileSync(cli, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (new URL(projectUrl).hostname !== `${ref}.supabase.co`) throw new Error('Unexpected project');
const before = run(['db', 'query', '--linked', '--project-ref', ref, '--output', 'json', `SELECT id,name FROM public.stores WHERE id='${storeId}' AND name='래틀'`]);
if (before.rows?.length !== 1) throw new Error('Expected demo store missing');
let config;
try { config = JSON.parse(await readFile(path, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
config ??= { projectUrl, anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, storeId, brokerToken: randomBytes(32).toString('hex'), accounts: {} };
if (config.projectUrl !== projectUrl || config.storeId !== storeId) throw new Error('Existing QA config belongs to a different fixture');
const keys = run(['projects', 'api-keys', '--project-ref', ref, '--reveal', '--output', 'json']);
const key = keys.find(k => k.name === 'service_role')?.api_key;
if (!key) throw new Error('Service role key unavailable');
const admin = createClient(projectUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
for (const [role, fixture] of Object.entries(fixtures)) {
  if (!config.accounts[role]) {
    const email = `rattle-qa-${role.replace('_', '-')}@example.com`;
    const password = randomBytes(32).toString('base64url');
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { name: fixture.name }, app_metadata: { qa_fixture: storeId, qa_role: role } });
    if (error) throw new Error(`Create QA ${role} failed (${error.code ?? error.status}); existing accounts are never overwritten`);
    config.accounts[role] = { id: data.user.id, email, password, ...fixture };
    await writeFile(path, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  const account = config.accounts[role];
  const { data, error } = await admin.auth.admin.getUserById(account.id);
  if (error || data.user.app_metadata.qa_fixture !== storeId || data.user.app_metadata.qa_role !== role) throw new Error('QA account marker mismatch');
}
const entries = Object.entries(config.accounts);
for (const [, account] of entries) if (!/^[0-9a-f-]{36}$/.test(account.id)) throw new Error('Invalid account id');
const sql = `BEGIN;
CREATE TEMP TABLE qa_fixture_before ON COMMIT DROP AS SELECT
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'')) FROM public.payroll p WHERE p.store_id='${storeId}') payroll_hash,
 (SELECT md5(coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.id)::text,'')) FROM public.employee_wage_history h WHERE h.store_id='${storeId}') wage_hash;
DO $qa$
DECLARE sid uuid := '${storeId}'; current_owner uuid; r record; existing public.store_members%ROWTYPE;
BEGIN
 SELECT owner_id INTO current_owner FROM public.stores WHERE id=sid AND name='래틀' AND setup_request_id='7a771e00-1026-4000-8000-000000000002' FOR UPDATE;
 IF current_owner IS NULL THEN RAISE EXCEPTION 'Demo store marker mismatch'; END IF;
 PERFORM set_config('request.jwt.claim.sub',current_owner::text,true);
 FOR r IN SELECT * FROM (VALUES
 ${entries.map(([role, a]) => `('${a.id}'::uuid,'${role}','${a.name}',${a.employeeId ? `'${a.employeeId}'::uuid` : 'NULL::uuid'})`).join(',\n')}
 ) AS v(uid,qa_role,display_name,employee_id) LOOP
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=r.uid AND u.raw_app_meta_data->>'qa_fixture'=sid::text AND u.raw_app_meta_data->>'qa_role'=r.qa_role)
    OR EXISTS (SELECT 1 FROM public.store_members m WHERE m.user_id=r.uid AND m.store_id<>sid)
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.owner_id=r.uid) THEN RAISE EXCEPTION 'QA user scope mismatch'; END IF;
  SELECT * INTO existing FROM public.store_members WHERE store_id=sid AND user_id=r.uid;
  IF existing.id IS NOT NULL AND (existing.status<>'approved' OR existing.role<>CASE WHEN r.qa_role='admin' THEN 'admin' ELSE 'member' END) THEN RAISE EXCEPTION 'Existing membership conflict'; END IF;
  IF existing.id IS NULL THEN
    INSERT INTO public.store_members(store_id,user_id,user_email,applicant_name,role,status)
    SELECT sid,r.uid,u.email,r.display_name,CASE WHEN r.qa_role='admin' THEN 'admin' ELSE 'member' END,'approved' FROM auth.users u WHERE u.id=r.uid;
  END IF;
  IF r.employee_id IS NOT NULL THEN
    PERFORM 1 FROM public.employees WHERE id=r.employee_id AND store_id=sid AND name=r.display_name AND employment_type=r.qa_role AND is_active AND (user_id IS NULL OR user_id=r.uid) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Virtual employee conflict'; END IF;
    UPDATE public.employees SET user_id=r.uid WHERE id=r.employee_id AND store_id=sid AND user_id IS NULL;
  END IF;
 END LOOP;
 IF (SELECT payroll_hash FROM qa_fixture_before) IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id)::text,'')) FROM public.payroll p WHERE p.store_id=sid)
 OR (SELECT wage_hash FROM qa_fixture_before) IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.id)::text,'')) FROM public.employee_wage_history h WHERE h.store_id=sid) THEN RAISE EXCEPTION 'Payroll/history changed'; END IF;
END $qa$;
COMMIT;`;
const sqlPath = new URL('../../.qa/setup.sql', import.meta.url);
await writeFile(sqlPath, sql, { mode: 0o600 });
run(['db', 'query', '--linked', '--project-ref', ref, '--file', sqlPath.pathname, '--output', 'json']);
console.log('QA fixture ready: 래틀 / admin, regular, part_time. Payroll/history hashes preserved.');
