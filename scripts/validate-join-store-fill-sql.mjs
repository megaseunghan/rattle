// Local PGlite only: no environment credentials, no network, no remote writes. QA-JOINSTORE-20261128 (가상 자료만).
// 20261127132000_join_income_probation.sql · 20261127133000_store_fill_and_setup_v2.sql 을 축약 스키마에 올려 확인한다.
// 원격 함수 원본은 scripts/fixtures/join-store-fill-remote-20261128.sql(원격 본문 md5와 같은 텍스트).
// 한계: approve_store_member·resolve_store_member_approval·is_store_admin은 스텁이고 계좌 암호화(20261127125000)·RLS·
//   private.assert_join_wage(기존 조건 유지 경로)는 올리지 않는다. approve_join_onboarding은 스텁 위에서 새 경로만 호출한다.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const U = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = U(1), manager = U(2), stranger = U(3), appl = i => U(100 + i);
let checks = 0;
const known = [];
const check = (actual, expected, name) => { assert.deepEqual(actual, expected, name); checks++; };
const file = (dir, name) => readFile(new URL(`../${dir}/${name}`, import.meta.url), 'utf8');
const migration = name => file('supabase/migrations', name);
async function asRole(role, uid, sql, values = []) {
  await db.exec('BEGIN');
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [uid ?? '']);
    await db.exec(`SET LOCAL ROLE ${role}`);
    const result = await db.query(sql, values);
    await db.exec('COMMIT');
    return result.rows;
  } catch (error) { await db.exec('ROLLBACK'); throw error; }
}
const as = (uid, sql, values) => asRole('authenticated', uid, sql, values);
async function rejects(promise, code, name) {
  await assert.rejects(promise, e => String(e.message).includes(code), `${name} (expected ${code})`);
  checks++;
}
async function attempt(promise) {
  try { return { ok: (await promise) }; } catch (e) { return { error: String(e.message) }; }
}
const q = async (sql, values = []) => (await db.query(sql, values)).rows;
const count = (text, frag) => (text.length - text.replaceAll(frag, '').length) / frag.length;
const defOf = async sig => (await q('SELECT pg_get_functiondef($1::regprocedure) AS d', [sig]))[0].d;

// ---------- 축약 스키마 ----------
await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
 GRANT USAGE ON SCHEMA auth, private TO authenticated, anon;
 CREATE TABLE public.stores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, owner_id uuid NOT NULL REFERENCES auth.users(id),
   address text, closing_time time DEFAULT '23:00', business_number text, industrial_accident_industry text,
   financial_share_scope text NOT NULL DEFAULT 'none' CHECK (financial_share_scope IN ('none','regular_only','all_staff')),
   pos_setup_choice text CHECK (pos_setup_choice IN ('now','later')), setup_request_id uuid,
   default_probation_months smallint, default_probation_rate numeric(5,4) NOT NULL DEFAULT 0.9,
   CONSTRAINT stores_default_probation_rate_check CHECK (default_probation_rate > 0 AND default_probation_rate <= 1),
   CONSTRAINT stores_default_probation_months_check CHECK (default_probation_months IS NULL OR default_probation_months IN (1,2,3)));
 CREATE UNIQUE INDEX stores_owner_setup_request_unique ON public.stores(owner_id, setup_request_id) WHERE setup_request_id IS NOT NULL;
 CREATE TABLE public.store_admins(store_id uuid, user_id uuid);
 GRANT SELECT, UPDATE ON public.stores TO authenticated;
 CREATE TABLE public.employees(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.stores(id), user_id uuid, name text, phone text,
   joined_at date, employment_type text, hourly_wage numeric, weekly_hours integer, base_salary numeric, non_taxable numeric, bank_name text, account_number text,
   is_active boolean DEFAULT true,
   income_type text NOT NULL DEFAULT 'employee' CONSTRAINT employees_income_type_check CHECK (income_type IN ('employee','freelancer')),
   weekly_minutes integer CONSTRAINT employees_weekly_minutes_check CHECK (weekly_minutes IS NULL OR weekly_minutes BETWEEN 0 AND 10080),
   weekly_rest_included boolean, is_probation boolean NOT NULL DEFAULT false, probation_started_at date, probation_ends_on date,
   probation_rate numeric(5,4) CONSTRAINT employees_probation_rate_check CHECK (probation_rate IS NULL OR (probation_rate > 0 AND probation_rate <= 1)));
 CREATE TABLE public.store_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.stores(id), user_id uuid NOT NULL,
   user_email text, applicant_name text, phone text, role text, status text NOT NULL DEFAULT 'pending', UNIQUE(store_id, user_id));
 CREATE TABLE public.store_invites(token uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES public.stores(id), code text, revoked_at timestamptz, expires_at timestamptz NOT NULL);
 CREATE TABLE public.store_join_profiles (
  member_id uuid PRIMARY KEY REFERENCES public.store_members(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  applicant_user_id uuid NOT NULL, submitted_by uuid,
  employment_type text NOT NULL CHECK(employment_type IN ('regular','part_time')),
  hourly_wage numeric, weekly_hours integer, base_salary numeric NOT NULL, non_taxable numeric NOT NULL, joined_at date NOT NULL,
  bank_name text NOT NULL CHECK(length(trim(bank_name)) BETWEEN 1 AND 50),
  account_number text NOT NULL CHECK(account_number ~ '^[0-9]{6,30}$'),
  revision integer NOT NULL DEFAULT 1, reviewed_revision integer, reviewed_profile jsonb,
  created_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL, reviewed_by uuid, reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(joined_at BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
  CHECK((employment_type='part_time' AND hourly_wage IS NOT NULL AND weekly_hours IS NOT NULL AND hourly_wage BETWEEN 1 AND 10000000 AND hourly_wage=trunc(hourly_wage)
    AND weekly_hours BETWEEN 0 AND 168 AND base_salary=0 AND non_taxable=0) OR
    (employment_type='regular' AND hourly_wage IS NULL AND weekly_hours IS NULL AND base_salary BETWEEN 1 AND 1000000000
    AND base_salary=trunc(base_salary) AND non_taxable BETWEEN 0 AND base_salary AND non_taxable=trunc(non_taxable))));
 CREATE TABLE public.employee_wage_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, employee_id uuid, effective_date date,
   base_salary numeric, hourly_wage numeric, non_taxable numeric, memo text, created_by uuid, created_at timestamptz DEFAULT now());
 -- 스텁(원격 본문이 아님): 관리자 판정, 승인 처리(직원 생성/재입사 연결).
 CREATE FUNCTION public.is_store_admin(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
   AS $$SELECT EXISTS(SELECT 1 FROM public.stores WHERE id=s AND owner_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.store_admins WHERE store_id=s AND user_id=auth.uid())$$;
 CREATE FUNCTION public.approve_store_member(p_member_id uuid) RETURNS TABLE(employee_id uuid, employee_name text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE m public.store_members%ROWTYPE; eid uuid;
 BEGIN
   SELECT * INTO m FROM public.store_members WHERE id=p_member_id;
   UPDATE public.store_members SET status='approved' WHERE id=p_member_id;
   eid := public.create_employee_from_join(m.store_id,m.user_id,m.applicant_name,m.phone);
   RETURN QUERY SELECT eid, m.applicant_name::text;
 END $$;
 CREATE FUNCTION public.resolve_store_member_approval(p_member_id uuid, p_employee_id uuid) RETURNS TABLE(employee_id uuid, employee_name text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE m public.store_members%ROWTYPE; eid uuid;
 BEGIN
   SELECT * INTO m FROM public.store_members WHERE id=p_member_id;
   IF p_employee_id IS NULL THEN RETURN QUERY SELECT * FROM public.approve_store_member(p_member_id); RETURN; END IF;
   UPDATE public.store_members SET status='approved' WHERE id=p_member_id;
   UPDATE public.employees SET user_id=m.user_id, is_active=true WHERE id=p_employee_id;
   RETURN QUERY SELECT p_employee_id, m.applicant_name::text;
 END $$;`);

// ---------- 원격 원본 적재 + 충실도(md5) 대조 ----------
const fixtureText = await file('scripts/fixtures', 'join-store-fill-remote-20261128.sql');
const expectedMd5 = [...fixtureText.matchAll(/^-- (\S+) md5=([0-9a-f]{32})$/gm)].map(m => [m[1], m[2]]);
check(expectedMd5.length, 9, 'fixture has 9 definitions with md5 headers');
const probMax130 = (await migration('20261127130000_probation_rate.sql'));
const probMaxFn = probMax130.slice(probMax130.indexOf('CREATE OR REPLACE FUNCTION private.probation_max_end'),
  probMax130.indexOf('FROM PUBLIC, anon, authenticated;', probMax130.indexOf('CREATE OR REPLACE FUNCTION private.probation_max_end')) + 'FROM PUBLIC, anon, authenticated;'.length);
await db.exec(probMaxFn);
await db.exec(fixtureText);
for (const [sig, md5] of expectedMd5) {
  const [schema, fn] = sig.includes('.') && !sig.startsWith('public.') ? [sig.split('.')[0], sig.split('.')[1]] : ['public', sig.replace(/^public\./, '')];
  const name = fn.replace(/\(.*$/, '');
  const [row] = await q('SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=$2', [schema, name]);
  check(createHash('md5').update(row.prosrc).digest('hex'), md5, `fixture md5 ${sig}`);
}
await db.exec(`CREATE TRIGGER guard_store_sharing_owner BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.guard_store_sharing_owner();
 CREATE TRIGGER employees_sync_weekly_minutes BEFORE INSERT OR UPDATE OF weekly_hours, weekly_minutes ON public.employees FOR EACH ROW EXECUTE FUNCTION private.sync_employee_weekly_minutes();
 CREATE TRIGGER employees_prepare_probation BEFORE INSERT OR UPDATE OF is_probation, probation_rate, store_id, probation_ends_on, probation_started_at, joined_at
   ON public.employees FOR EACH ROW EXECUTE FUNCTION private.prepare_employee_probation();`);

// ---------- 시드(가상) ----------
for (const [id, email] of [[owner, 'o@qa.invalid'], [manager, 'm@qa.invalid'], [stranger, 's@qa.invalid'], ...Array.from({ length: 12 }, (_, i) => [appl(i + 1), `a${i + 1}@qa.invalid`])]) {
  await q('INSERT INTO auth.users VALUES ($1,$2)', [id, email]);
}
const stores = Array.from({ length: 12 }, (_, i) => U(1000 + i));
for (const [i, id] of stores.entries()) {
  await q('INSERT INTO public.stores(id,name,owner_id,address,closing_time,business_number,financial_share_scope) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, `QA매장${i + 1}`, owner, i % 2 ? '서울 어딘가' : null, i % 3 ? '23:00' : '02:30', i % 4 ? null : '1234567890', 'all_staff']);
}
const S = stores[0], S2 = stores[1], S3 = stores[2];
await q('INSERT INTO public.store_admins VALUES ($1,$2)', [S, manager]);
await q('UPDATE public.stores SET default_probation_rate=0.95 WHERE id=$1', [S2]);
await q('INSERT INTO public.store_invites VALUES ($1,$2,$3,NULL,now()+interval \'1 day\')', [U(5001), S, 'AAAAAAAAAAAAAAAA']);
await q('INSERT INTO public.store_invites VALUES ($1,$2,$3,NULL,now()+interval \'1 day\')', [U(5002), S2, 'BBBBBBBBBBBBBBBB']);
const [oldEmp] = await q(`INSERT INTO public.employees(store_id,name,joined_at,employment_type,weekly_hours,base_salary,hourly_wage,non_taxable) VALUES ($1,'QA기존','2026-01-01','part_time',20,0,10030,0) RETURNING id`, [S]);
// 합류 신청 한 건(이전 앱 모양)을 마이그레이션 전에 만들어 둔다.
const oldProfile = { employment_type: 'part_time', hourly_wage: 10030, weekly_hours: 20, base_salary: 0, non_taxable: 0, joined_at: '2026-11-01', bank_name: '국민', account_number: '110-123-456789' };
const regProfile = { employment_type: 'regular', hourly_wage: null, weekly_hours: null, base_salary: 3000000, non_taxable: 200000, joined_at: '2026-11-01', bank_name: '신한', account_number: '1002-333-444555' };
const submitSql = 'SELECT * FROM public.submit_join_onboarding_invite($1::uuid,$2,$3,$4::jsonb)';
await as(appl(1), submitSql, [U(5001), '지원자1', '010-1111-2222', JSON.stringify(oldProfile)]);

// 이전 상태 스냅샷(불변 확인용)
const NEW_STORE_COLS = ['is_open_24h', 'payroll_close_day', 'payday_month_offset', 'payday_day', 'payday_holiday_rule', 'headcount_class', 'business_entity_type', 'vat_type', 'social_insurance_enrolled'];
const NEW_PROFILE_COLS = ['income_type', 'weekly_minutes', 'weekly_rest_included'];
const strip = (rows, cols) => rows.map(r => Object.fromEntries(Object.entries(r.j).filter(([k]) => !cols.includes(k))));
const snap = async () => ({
  stores: await q('SELECT to_jsonb(s) AS j FROM public.stores s ORDER BY id'),
  employees: await q('SELECT to_jsonb(e) AS j FROM public.employees e ORDER BY id'),
  profiles: await q('SELECT to_jsonb(p) AS j FROM public.store_join_profiles p ORDER BY member_id'),
  members: await q('SELECT to_jsonb(m) AS j FROM public.store_members m ORDER BY id'),
});
const before = await snap();
check(before.stores.length, 12, 'seed: 12 existing stores');

const oldInputs = {
  partOk: oldProfile, regularOk: regProfile,
  hoursFraction: { ...oldProfile, weekly_hours: 20.5 }, hours169: { ...oldProfile, weekly_hours: 169 },
  noJoinedAt: { ...oldProfile, joined_at: undefined }, extraUnknownKey: { ...oldProfile, foo: 'bar' },
  regularWithHours: { ...regProfile, weekly_hours: 10 }, wageZero: { ...oldProfile, hourly_wage: 0 },
  badAccount: { ...oldProfile, account_number: '12' }, array: [1],
};
const validate = async input => attempt(q('SELECT public.validate_join_profile($1::jsonb) AS v', [JSON.stringify(input)]).then(r => r[0].v));
const oldOutputs = {};
for (const [k, v] of Object.entries(oldInputs)) oldOutputs[k] = await validate(v);
check(oldOutputs.partOk.ok.weekly_hours, 20, 'baseline part ok');
check(oldOutputs.hoursFraction.error.includes('JOIN_PROFILE_INVALID'), true, 'baseline invalid');

// 함수 속성(권한·search_path·보안) 스냅샷
const meta = async () => q(`SELECT p.oid::regprocedure::text AS sig, p.prosecdef, p.provolatile, p.proconfig::text AS cfg, p.proacl::text AS acl, pg_get_userbyid(p.proowner) AS owner
  FROM pg_proc p WHERE p.oid IN ('public.validate_join_profile(jsonb)'::regprocedure,'public.approve_join_onboarding(uuid,integer,jsonb,text,uuid)'::regprocedure,
  'public.submit_join_onboarding_invite(uuid,text,text,jsonb)'::regprocedure) ORDER BY 1`);
const metaBefore = await meta();

// ---------- 조각 개수(원격 원본 기준) ----------
const approveDef = await defOf('public.approve_join_onboarding(uuid,integer,jsonb,text,uuid)');
const submitDef = await defOf('public.submit_join_onboarding_invite(uuid,text,text,jsonb)');
for (const frag of ['reviewed:=public.validate_join_profile(p_review);', 'non_taxable,joined_at,bank_name,account_number)',
  'p.non_taxable,p.joined_at,p.bank_name,p.account_number);', '  RETURN QUERY SELECT result.employee_id::uuid,result.employee_name::text;']) {
  check(count(approveDef, frag), 1, `approve fragment once: ${frag.trim().slice(0, 40)}`);
}
for (const frag of ['non_taxable,joined_at,bank_name,account_number)', 'profile.joined_at,profile.bank_name,profile.account_number)', 'account_number=excluded.account_number,']) {
  check(count(submitDef, frag), 1, `submit fragment once: ${frag.slice(0, 40)}`);
}

// ---------- 20261127132000 적용 ----------
// 필요한 선행 열(20261127120000)·함수는 축약 스키마에 이미 있다. 가드가 통과해야 한다.
await db.exec(await migration('20261127132000_join_income_probation.sql'));
const approveAfter = await defOf('public.approve_join_onboarding(uuid,integer,jsonb,text,uuid)');
const submitAfter = await defOf('public.submit_join_onboarding_invite(uuid,text,text,jsonb)');
check([approveAfter.includes('reviewed:=reviewed||private.validate_join_probation(p_review,(reviewed->>\'joined_at\')::date);'),
  approveAfter.includes('account_number,income_type,weekly_minutes,weekly_rest_included)'),
  approveAfter.includes('p.account_number,p.income_type,p.weekly_minutes,p.weekly_rest_included);'),
  approveAfter.includes('PERFORM private.apply_join_review_extras(result.employee_id::uuid,m.store_id,reviewed);')], [true, true, true, true], 'approve new fragments inserted');
check([submitAfter.includes('income_type=excluded.income_type,weekly_minutes=excluded.weekly_minutes,weekly_rest_included=excluded.weekly_rest_included,'),
  submitAfter.includes('profile.income_type,profile.weekly_minutes,profile.weekly_rest_included)')], [true, true], 'submit new fragments inserted');
check(count(approveAfter, 'PERFORM private.apply_join_review_extras'), 1, 'apply_join_review_extras called once');
check(await meta(), metaBefore, 'owner/security definer/volatility/search_path/ACL unchanged by function swap');
check((await q(`SELECT has_function_privilege('authenticated','private.validate_join_probation(jsonb,date)','EXECUTE') a,
  has_function_privilege('anon','private.validate_join_probation(jsonb,date)','EXECUTE') b,
  has_function_privilege('authenticated','private.apply_join_review_extras(uuid,uuid,jsonb)','EXECUTE') c,
  has_function_privilege('anon','private.apply_join_review_extras(uuid,uuid,jsonb)','EXECUTE') d`))[0], { a: false, b: false, c: false, d: false }, 'private functions not executable by authenticated/anon');
await rejects(as(owner, "SELECT private.apply_join_review_extras($1,$2,'{}'::jsonb)", [oldEmp.id, S]), 'permission denied', 'owner cannot call extras directly');
await rejects(as(owner, "SELECT private.validate_join_probation('{}'::jsonb, NULL)"), 'permission denied', 'owner cannot call validate_join_probation directly');
const afterMigration = await snap();
check(strip(afterMigration.profiles, NEW_PROFILE_COLS), strip(before.profiles, NEW_PROFILE_COLS), 'existing join profile row unchanged');
check([afterMigration.profiles[0].j.income_type, afterMigration.profiles[0].j.weekly_minutes, afterMigration.profiles[0].j.weekly_rest_included], [null, null, null], 'existing join profile new columns null');
check(afterMigration.employees, before.employees, 'employees untouched by 132000');

// ---------- validate_join_profile ----------
for (const [k, v] of Object.entries(oldInputs)) check(await validate(v), oldOutputs[k], `old input same result: ${k}`);
const okMin = await validate({ ...oldProfile, weekly_hours: undefined, weekly_minutes: 1210, income_type: 'freelancer', weekly_rest_included: true });
check([okMin.ok.weekly_hours, okMin.ok.weekly_minutes, okMin.ok.income_type, okMin.ok.weekly_rest_included], [20, 1210, 'freelancer', true], 'new keys: minutes→hours floor, extras in result');
check((await validate({ ...oldProfile, weekly_minutes: 1210 })).ok.weekly_hours, 20, 'minutes win over hours');
check((await validate({ ...oldProfile, weekly_hours: undefined, weekly_minutes: 0 })).ok.weekly_hours, 0, 'zero minutes ok');
check((await validate({ ...oldProfile, weekly_minutes: 10080, weekly_hours: undefined })).ok.weekly_hours, 168, '10080 minutes = 168h');
check((await validate({ ...oldProfile, income_type: 'unknown' })).ok.income_type, 'unknown', 'unknown allowed at apply time');
check('income_type' in (await validate(oldProfile)).ok, false, 'no new keys → none in result');
for (const [name, patch] of Object.entries({
  minutes1215: { weekly_minutes: 1215 }, minutes10090: { weekly_minutes: 10090 }, minutesNeg: { weekly_minutes: -10 }, minutesFraction: { weekly_minutes: 1210.5 },
  minutesString: { weekly_minutes: 'abc' }, incomeDaily: { income_type: 'daily' }, incomeNumber: { income_type: 1 }, restString: { weekly_rest_included: 'true' },
})) check((await validate({ ...oldProfile, ...patch })).error.includes('JOIN_PROFILE_INVALID'), true, `invalid new input: ${name}`);
check((await validate({ ...regProfile, weekly_minutes: 600 })).error.includes('JOIN_PROFILE_INVALID'), true, 'regular + minutes invalid');
check((await validate({ ...regProfile, weekly_rest_included: true })).error.includes('JOIN_PROFILE_INVALID'), true, 'regular + rest=true invalid');
check((await validate({ ...regProfile, weekly_rest_included: null })).ok.weekly_rest_included, null, 'regular + rest=null ok');
check((await validate({ ...oldProfile, weekly_minutes: null })).ok.weekly_hours, 20, 'minutes null → hours path');
const nullIncome = await validate({ ...oldProfile, income_type: null });
// types/index.ts JoinOnboardingInput.income_type 은 null을 허용하고 "비우면 이전 앱"이라 적혀 있으나 서버는 null을 거절한다.
known.push(`income_type:null → ${nullIncome.error ? 'JOIN_PROFILE_INVALID(거절)' : '허용'}`);

// ---------- private.validate_join_probation ----------
const vp = (review, joined = '2026-11-01') => attempt(q('SELECT private.validate_join_probation($1::jsonb,$2::date) AS v', [JSON.stringify(review), joined]).then(r => r[0].v));
check((await vp({})).ok, {}, 'probation: key absent → {}');
check((await vp({ is_probation: false, probation_ends_on: '2020-01-01' })).ok, { is_probation: false, probation_ends_on: null, probation_rate: null }, 'probation: off clears');
check((await vp({ is_probation: true, probation_ends_on: '2027-01-31', probation_rate: 0.95 })).ok, { is_probation: true, probation_ends_on: '2027-01-31', probation_rate: 0.95 }, 'probation: valid');
check((await vp({ is_probation: true, probation_ends_on: '2027-01-31' })).ok.probation_rate, null, 'probation: rate omitted → null');
check((await vp({ is_probation: true, probation_ends_on: '2027-01-31', probation_rate: null })).ok.probation_rate, null, 'probation: rate null');
check((await vp({ is_probation: true, probation_ends_on: '2026-11-01' })).ok.probation_ends_on, '2026-11-01', 'probation: end = joined day ok');
check((await vp({ is_probation: true, probation_ends_on: '2027-01-31' }, '2026-11-01')).ok.probation_ends_on, '2027-01-31', 'probation: 3-month boundary ok');
check((await vp({ is_probation: true, probation_ends_on: '2027-02-28' }, '2026-11-30')).ok.probation_ends_on, '2027-02-28', 'probation: 11-30 + 3m = 02-28 ok');
check((await vp({ is_probation: true, probation_ends_on: '2027-03-01' }, '2026-11-30')).error.includes('PROBATION_END_OUT_OF_RANGE'), true, 'probation: 02-28 + 1 blocked');
for (const [name, review, code] of [
  ['over 3 months', { is_probation: true, probation_ends_on: '2027-02-01' }, 'PROBATION_END_OUT_OF_RANGE'],
  ['before joined', { is_probation: true, probation_ends_on: '2026-10-31' }, 'PROBATION_END_OUT_OF_RANGE'],
  ['string flag', { is_probation: 'true', probation_ends_on: '2027-01-01' }, 'JOIN_PROBATION_INVALID'],
  ['null flag', { is_probation: null }, 'JOIN_PROBATION_INVALID'],
  ['no end date', { is_probation: true }, 'JOIN_PROBATION_INVALID'],
  ['null end date', { is_probation: true, probation_ends_on: null }, 'JOIN_PROBATION_INVALID'],
  ['bad date text', { is_probation: true, probation_ends_on: '2027-1-1' }, 'JOIN_PROBATION_INVALID'],
  ['impossible date', { is_probation: true, probation_ends_on: '2027-02-30' }, 'JOIN_PROBATION_INVALID'],
  ['numeric date', { is_probation: true, probation_ends_on: 20270101 }, 'JOIN_PROBATION_INVALID'],
  ['rate 0', { is_probation: true, probation_ends_on: '2027-01-01', probation_rate: 0 }, 'JOIN_PROBATION_INVALID'],
  ['rate 1.5', { is_probation: true, probation_ends_on: '2027-01-01', probation_rate: 1.5 }, 'JOIN_PROBATION_INVALID'],
  ['rate string', { is_probation: true, probation_ends_on: '2027-01-01', probation_rate: '0.9' }, 'JOIN_PROBATION_INVALID'],
]) check((await vp(review)).error.includes(code), true, `probation invalid: ${name}`);

// ---------- private.apply_join_review_extras (직접) ----------
const emp = async id => (await q('SELECT income_type, weekly_hours, weekly_minutes, weekly_rest_included, is_probation, probation_ends_on::text AS ends, probation_rate::text AS rate, probation_started_at FROM public.employees WHERE id=$1', [id]))[0];
const ex = (id, store, review) => q('SELECT private.apply_join_review_extras($1,$2,$3::jsonb)', [id, store, JSON.stringify(review)]);
const [e2] = await q(`INSERT INTO public.employees(store_id,name,joined_at,employment_type,weekly_hours,hourly_wage) VALUES ($1,'QA수습','2026-11-01','part_time',20,10030) RETURNING id`, [S2]);
check(await emp(e2.id), { income_type: 'employee', weekly_hours: 20, weekly_minutes: 1200, weekly_rest_included: null, is_probation: false, ends: null, rate: null, probation_started_at: null }, 'extras: baseline');
await ex(e2.id, S2, {});
check(await emp(e2.id), { income_type: 'employee', weekly_hours: 20, weekly_minutes: 1200, weekly_rest_included: null, is_probation: false, ends: null, rate: null, probation_started_at: null }, 'extras: no keys → unchanged');
await ex(e2.id, S2, { income_type: 'freelancer', weekly_minutes: 1210, weekly_rest_included: true, is_probation: true, probation_ends_on: '2027-01-31', probation_rate: null });
check(await emp(e2.id), { income_type: 'freelancer', weekly_hours: 20, weekly_minutes: 1210, weekly_rest_included: true, is_probation: true, ends: '2027-01-31', rate: '0.9500', probation_started_at: null }, 'extras: applied, rate null → store default 0.95');
await ex(e2.id, S2, { is_probation: false, probation_ends_on: null, probation_rate: null });
check([(await emp(e2.id)).is_probation, (await emp(e2.id)).ends, (await emp(e2.id)).rate, (await emp(e2.id)).income_type], [false, null, null, 'freelancer'], 'extras: probation off clears, other keys kept');
await ex(e2.id, S2, { weekly_rest_included: null });
check((await emp(e2.id)).weekly_rest_included, null, 'extras: explicit null rest clears');
await rejects(ex(e2.id, S2, { income_type: 'unknown' }), 'JOIN_INCOME_TYPE_REQUIRED', 'extras: unknown blocked');
await rejects(ex(e2.id, S, {}), 'JOIN_REVIEW_CHANGED', 'extras: store mismatch');
await rejects(ex(null, S2, {}), 'JOIN_REVIEW_CHANGED', 'extras: null employee');
await rejects(ex(e2.id, S2, { is_probation: true, probation_ends_on: '2027-02-01', probation_rate: null }), 'PROBATION_END_OUT_OF_RANGE', 'extras: trigger also guards range');

// ---------- approve_join_onboarding 전체(스텁 위) ----------
const approveSql = 'SELECT * FROM public.approve_join_onboarding($1::uuid,$2::int,$3::jsonb,$4,$5::uuid)';
const member = async (store, user) => (await q('SELECT m.id, m.status, p.revision FROM public.store_members m LEFT JOIN public.store_join_profiles p ON p.member_id=m.id WHERE m.store_id=$1 AND m.user_id=$2', [store, user]))[0];
const tokenOf = store => store === S ? U(5001) : U(5002);

// (a) 이전 앱: 새 키 없는 신청 → 새 키 없는 승인. 직원은 근로자 기본값, 분은 시간×60, 수습 없음.
let mem = await member(S, appl(1));
const oldApproved = await as(owner, approveSql, [mem.id, mem.revision, JSON.stringify(oldProfile), 'auto', null]);
let eid = oldApproved[0].employee_id;
check(await emp(eid), { income_type: 'employee', weekly_hours: 20, weekly_minutes: 1200, weekly_rest_included: null, is_probation: false, ends: null, rate: null, probation_started_at: null }, 'approve old app: employee defaults');
check((await q('SELECT count(*)::int n FROM public.employee_wage_history WHERE employee_id=$1', [eid]))[0].n >= 1, true, 'approve old app: wage history written');
const reviewedOld = (await q('SELECT reviewed_profile FROM public.store_join_profiles WHERE member_id=$1', [mem.id]))[0].reviewed_profile;
check(Object.keys(reviewedOld).sort(), ['account_number', 'bank_name', 'base_salary', 'employment_type', 'hourly_wage', 'joined_at', 'non_taxable', 'weekly_hours'], 'approve old app: reviewed_profile keys unchanged');

// (b) 새 앱: 신청(계약·분·주휴) → 승인(수습 포함)
const newProfile = { ...oldProfile, weekly_hours: undefined, weekly_minutes: 1210, income_type: 'freelancer', weekly_rest_included: false };
await as(appl(2), submitSql, [tokenOf(S), '지원자2', '010-2222-3333', JSON.stringify(newProfile)]);
mem = await member(S, appl(2));
const stored = (await q('SELECT income_type, weekly_minutes, weekly_rest_included, weekly_hours FROM public.store_join_profiles WHERE member_id=$1', [mem.id]))[0];
check(stored, { income_type: 'freelancer', weekly_minutes: 1210, weekly_rest_included: false, weekly_hours: 20 }, 'submit new app: new columns stored');
const review = { ...newProfile, is_probation: true, probation_ends_on: '2027-01-31', probation_rate: 0.95 };
const newApproved = await as(owner, approveSql, [mem.id, mem.revision, JSON.stringify(review), 'new', null]);
check(await emp(newApproved[0].employee_id), { income_type: 'freelancer', weekly_hours: 20, weekly_minutes: 1210, weekly_rest_included: false, is_probation: true, ends: '2027-01-31', rate: '0.9500', probation_started_at: null }, 'approve new app: employee gets contract/minutes/rest/probation');
const reviewedNew = (await q('SELECT reviewed_profile, created_employee_id FROM public.store_join_profiles WHERE member_id=$1', [mem.id]))[0];
check([reviewedNew.reviewed_profile.probation_ends_on, reviewedNew.reviewed_profile.is_probation, reviewedNew.reviewed_profile.weekly_minutes], ['2027-01-31', true, 1210], 'approve new app: audit has probation + minutes');
// 재제출(이전 앱 모양)은 새 열을 null로 되돌리고 개정 번호를 올린다 — 승인 전 신청으로 확인.
await as(appl(3), submitSql, [tokenOf(S2), '지원자3', '010-3333-4444', JSON.stringify(newProfile)]);
await as(appl(3), submitSql, [tokenOf(S2), '지원자3', '010-3333-4444', JSON.stringify(oldProfile)]);
mem = await member(S2, appl(3));
check([mem.revision, ...Object.values((await q('SELECT income_type, weekly_minutes, weekly_rest_included FROM public.store_join_profiles WHERE member_id=$1', [mem.id]))[0])], [2, null, null, null], 'resubmit old shape resets new columns, revision+1');
// 새 앱 + 수습 키 없음(수습 안 바꿈) + 매장 기본 비율 채움 확인은 extras 직접 검사로 끝났다.

// (c) 잘 모르겠어요가 최종 합류에 남으면 막고, 전부 되돌아간다.
await as(appl(4), submitSql, [tokenOf(S), '지원자4', '010-4444-5555', JSON.stringify({ ...newProfile, income_type: 'unknown' })]);
mem = await member(S, appl(4));
const empCountBefore = (await q('SELECT count(*)::int n FROM public.employees WHERE store_id=$1', [S]))[0].n;
await rejects(as(owner, approveSql, [mem.id, mem.revision, JSON.stringify({ ...newProfile, income_type: 'unknown' }), 'new', null]), 'JOIN_INCOME_TYPE_REQUIRED', 'approve: unknown blocked');
check([(await member(S, appl(4))).status, (await q('SELECT count(*)::int n FROM public.employees WHERE store_id=$1', [S]))[0].n,
  (await q('SELECT reviewed_revision FROM public.store_join_profiles WHERE member_id=$1', [mem.id]))[0].reviewed_revision], ['pending', empCountBefore, null], 'approve unknown: fully rolled back');
// (d) 수습 범위 위반·형식 위반도 전부 되돌린다.
await rejects(as(owner, approveSql, [mem.id, mem.revision, JSON.stringify({ ...newProfile, income_type: 'employee', is_probation: true, probation_ends_on: '2027-03-01' }), 'new', null]), 'PROBATION_END_OUT_OF_RANGE', 'approve: probation range');
await rejects(as(owner, approveSql, [mem.id, mem.revision, JSON.stringify({ ...newProfile, income_type: 'employee', is_probation: true }), 'new', null]), 'JOIN_PROBATION_INVALID', 'approve: probation missing end');
check((await member(S, appl(4))).status, 'pending', 'approve invalid probation: still pending');
// (e) 권한: 점장이 아닌 외부인은 승인 불가, 새 키가 있어도 마찬가지.
await rejects(as(stranger, approveSql, [mem.id, mem.revision, JSON.stringify({ ...newProfile, income_type: 'employee' }), 'new', null]), '승인할 권한이 없습니다', 'approve: stranger rejected');
// (f) 낡은 개정 번호
await rejects(as(owner, approveSql, [mem.id, mem.revision + 5, JSON.stringify({ ...newProfile, income_type: 'employee' }), 'new', null]), 'JOIN_REVIEW_CHANGED', 'approve: stale revision');
// (g) 승인 뒤 새 열 포함 정상 승인(점장) 한 번 더: 점장도 승인 가능, 수습 끔.
const okFinal = await as(manager, approveSql, [mem.id, mem.revision, JSON.stringify({ ...newProfile, income_type: 'employee', is_probation: false }), 'new', null]);
check((await emp(okFinal[0].employee_id)).income_type, 'employee', 'approve: manager ok after fixing contract');

// (h) 재입사 직원의 옛 수습 마지막 날이 새 입사일 범위를 벗어나도, 리뷰에 수습 키가 있으면 먼저 비우고 합류한다.
const [reh] = await q(`INSERT INTO public.employees(store_id,name,joined_at,employment_type,base_salary,non_taxable,is_active,is_probation,probation_ends_on)
  VALUES ($1,'QA재입사','2026-01-01','regular',3000000,0,false,true,'2026-02-28') RETURNING id`, [S]);
await as(appl(5), submitSql, [tokenOf(S), '지원자5', '010-5555-6666', JSON.stringify(regProfile)]);
mem = await member(S, appl(5));
const rehireReview = { ...regProfile, income_type: 'employee', is_probation: false, probation_ends_on: null, probation_rate: null };
const rehired = await as(owner, approveSql, [mem.id, mem.revision, JSON.stringify(rehireReview), 'rehire', reh.id]);
{
  const e = await emp(rehired[0].employee_id);
  check([e.is_probation, e.ends], [false, null], 'rehire with stale probation passes and clears');
}

// ---------- 20261127132000 재실행 ----------
await rejects(db.exec(await migration('20261127132000_join_income_probation.sql')), 'JOIN_INCOME_BASE_CHANGED', 'rerun 132000 stops at md5 guard');
await db.exec('ROLLBACK');
check(count(await defOf('public.approve_join_onboarding(uuid,integer,jsonb,text,uuid)'), 'apply_join_review_extras'), 1, 'rerun leaves definition intact');

// ---------- 20261127133000 stores ----------
const storeBefore = await snap();
await db.exec(await migration('20261127133000_store_fill_and_setup_v2.sql'));
const storeAfter = await snap();
check(strip(storeAfter.stores, NEW_STORE_COLS), strip(storeBefore.stores, NEW_STORE_COLS), 'existing 12 stores: old columns unchanged');
check(storeAfter.stores.every(r => r.j.is_open_24h === false && NEW_STORE_COLS.slice(1).every(c => r.j[c] === null)), true, 'existing stores: is_open_24h=false, fill columns null');
check(storeAfter.employees, storeBefore.employees, 'employees untouched by 133000');
check(storeAfter.profiles, storeBefore.profiles, 'profiles untouched by 133000');
const badFill = {
  payroll_close_day: [30, -1], payday_month_offset: [2, -1], payday_day: [30, -1], payday_holiday_rule: ['x', ''], headcount_class: ['x', ''],
  business_entity_type: ['x', ''], vat_type: ['x', ''],
};
for (const [col, vals] of Object.entries(badFill)) for (const v of vals) {
  await rejects(as(owner, `UPDATE public.stores SET ${col}=$1 WHERE id=$2`, [v, S]), 'violates check constraint', `CHECK ${col}=${v}`);
}
for (const [col, v] of [['payroll_close_day', 0], ['payroll_close_day', 29], ['payday_month_offset', 1], ['payday_day', 0], ['payday_holiday_rule', 'before'], ['headcount_class', 'unknown'],
  ['business_entity_type', 'corporation'], ['vat_type', 'simplified'], ['social_insurance_enrolled', true], ['industrial_accident_industry', 'retail_food_lodging']]) {
  await as(owner, `UPDATE public.stores SET ${col}=$1 WHERE id=$2`, [v, S3]);
}
check((await q('SELECT payroll_close_day, payday_month_offset, payday_day, payday_holiday_rule, headcount_class, business_entity_type, vat_type, social_insurance_enrolled, industrial_accident_industry FROM public.stores WHERE id=$1', [S3]))[0],
  { payroll_close_day: 29, payday_month_offset: 1, payday_day: 0, payday_holiday_rule: 'before', headcount_class: 'unknown', business_entity_type: 'corporation', vat_type: 'simplified', social_insurance_enrolled: true, industrial_accident_industry: 'retail_food_lodging' }, 'owner can set every fill column');
for (const [col, v] of [['payroll_close_day', 5], ['payday_month_offset', 0], ['payday_day', 10], ['payday_holiday_rule', 'after'], ['headcount_class', 'five_or_more'],
  ['business_entity_type', 'individual'], ['vat_type', 'general'], ['social_insurance_enrolled', false], ['industrial_accident_industry', 'x']]) {
  await rejects(as(manager, `UPDATE public.stores SET ${col}=$1 WHERE id=$2`, [v, S]), 'STORE_FILL_OWNER_REQUIRED', `manager cannot change ${col}`);
}
await rejects(as(stranger, 'UPDATE public.stores SET vat_type=$1 WHERE id=$2', ['general', S]), 'STORE_FILL_OWNER_REQUIRED', 'non-owner non-admin cannot change fill');
await as(manager, 'UPDATE public.stores SET closing_time=$1, business_number=$2, name=$3 WHERE id=$4', ['21:00', '9999999999', 'QA매장1', S]);
check((await q('SELECT closing_time::text c, business_number b FROM public.stores WHERE id=$1', [S]))[0], { c: '21:00:00', b: '9999999999' }, 'manager still edits closing_time/business_number');
await as(manager, 'UPDATE public.stores SET vat_type=vat_type, payroll_close_day=payroll_close_day WHERE id=$1', [S3]);
check(true, true, 'manager no-op write of unchanged fill columns allowed');
await rejects(as(manager, 'UPDATE public.stores SET financial_share_scope=$1 WHERE id=$2', ['none', S]), 'STORE_OWNER_REQUIRED', 'old sharing guard still works');
// 서비스 역할/SQL 편집기(auth.uid() 없음): 마저 채우기 칸 수정이 막힌다 — 운영 보정이 필요하면 트리거를 잠시 끄거나 uid를 설정해야 한다.
const noUid = await attempt(q('UPDATE public.stores SET vat_type=$1 WHERE id=$2', ['general', S]));
known.push(`auth.uid() 없는 세션(SQL 편집기·service_role)에서 마저 채우기 칸 수정 → ${noUid.error ? 'STORE_FILL_OWNER_REQUIRED(막힘)' : '허용'}`);

// ---------- create_store_with_setup_v2 ----------
const v2 = 'SELECT public.create_store_with_setup_v2($1,$2,$3::uuid,$4,$5::time,$6,$7::smallint,$8::numeric) AS s';
const base = ['QA 새 매장', 'none', U(9001), '서울시 어딘가', '06:00', false, 3, 0.95];
const call = (uid, args) => as(uid, v2, args);
const mod = (...pairs) => { const a = [...base]; for (let i = 0; i < pairs.length; i += 2) a[pairs[i]] = pairs[i + 1]; return a; };
check((await q(`SELECT has_function_privilege('anon','public.create_store_with_setup_v2(text,text,uuid,text,time,boolean,smallint,numeric)','EXECUTE') a,
  has_function_privilege('authenticated','public.create_store_with_setup_v2(text,text,uuid,text,time,boolean,smallint,numeric)','EXECUTE') b,
  has_function_privilege('public','public.create_store_with_setup_v2(text,text,uuid,text,time,boolean,smallint,numeric)','EXECUTE') c`))[0], { a: false, b: true, c: false }, 'v2 grants: anon/public no, authenticated yes');
await rejects(asRole('anon', null, v2, base), 'permission denied', 'anon cannot execute v2');
await rejects(call(null, base), 'AUTH_REQUIRED', 'v2 needs login');
for (const [name, args] of Object.entries({
  emptyName: mod(0, '   '), longName: mod(0, 'ㄱ'.repeat(81)), nullName: mod(0, null), badShare: mod(1, 'x'), nullShare: mod(1, null), nullRequest: mod(2, null),
  longAddress: mod(3, 'a'.repeat(201)), nullClosing: mod(4, null), halfHour: mod(4, '06:30'), seconds: mod(4, '06:00:01'), null24h: mod(5, null),
  months4: mod(6, 4), months0: mod(6, 0), rateZero: mod(7, 0), rateOver: mod(7, 1.1), rateNeg: mod(7, -0.5),
})) await rejects(call(owner, args), 'INVALID_STORE_SETUP', `v2 invalid: ${name}`);
check((await q('SELECT count(*)::int n FROM public.stores WHERE owner_id=$1', [owner]))[0].n, 12, 'v2 invalid inputs created nothing');
const first = (await call(owner, base))[0].s;
check([first.name, first.owner_id, first.address, first.closing_time, first.is_open_24h, first.default_probation_months, first.default_probation_rate, first.pos_setup_choice, first.financial_share_scope, first.setup_request_id],
  ['QA 새 매장', owner, '서울시 어딘가', '06:00:00', false, 3, 0.95, 'later', 'none', U(9001)], 'v2 creates store with all inputs');
check(NEW_STORE_COLS.slice(1).every(c => first[c] === null), true, 'v2 leaves fill columns null');
const retry = (await call(owner, mod(0, '다른 이름', 6, 1, 7, 0.5)))[0].s;
check([retry.id, retry.name, retry.default_probation_months], [first.id, 'QA 새 매장', 3], 'v2 retry returns first store, ignores new params');
check((await q('SELECT count(*)::int n FROM public.stores WHERE owner_id=$1 AND setup_request_id=$2', [owner, U(9001)]))[0].n, 1, 'v2 retry no duplicate');
const otherUser = (await call(stranger, base))[0].s;
check([otherUser.id !== first.id, otherUser.owner_id], [true, stranger], 'v2 same requestId from another account → own store');
const noProb = (await call(owner, mod(2, U(9002), 6, null, 7, 0.8, 3, '  ', 5, true, 4, '03:00')))[0].s;
check([noProb.default_probation_months, noProb.default_probation_rate, noProb.address, noProb.is_open_24h, noProb.closing_time], [null, 0.9, null, true, '03:00:00'], 'v2 no probation → rate 0.9, blank address null, 24h');
const noRate = (await call(owner, mod(2, U(9003), 7, null)))[0].s;
check([noRate.default_probation_months, noRate.default_probation_rate], [3, 0.9], 'v2 months set but rate null → 0.9');
const midnight = (await call(owner, mod(2, U(9004), 4, '00:00')))[0].s;
check(midnight.closing_time, '00:00:00', 'v2 closing 00:00 ok');
const v1 = (await as(owner, 'SELECT public.create_store_with_setup($1,$2,$3,$4::uuid) AS s', ['QA v1', 'later', 'none', U(9005)]))[0].s;
const viaV2 = (await call(owner, mod(2, U(9005))))[0].s;
check(viaV2.id, v1.id, 'v1 and v2 share the retry key');
await rejects(as(owner, 'SELECT public.create_store_with_setup_v2($1,$2,$3::uuid)', ['x', 'none', U(9006)]), 'does not exist', 'v2 requires all 8 args (no defaults)');
// 두 요청 동시성은 단일 연결 PGlite로 검증할 수 없다(advisory lock·unique index만 존재 확인).
check((await q("SELECT count(*)::int n FROM pg_indexes WHERE indexname='stores_owner_setup_request_unique'"))[0].n, 1, 'unique (owner, request) index backs v2 retries');

// ---------- 133000 재실행 ----------
const rowsBefore = await snap();
await db.exec(await migration('20261127133000_store_fill_and_setup_v2.sql'));
const rowsAfter = await snap();
check(rowsAfter, rowsBefore, 'rerun 133000 changes no rows');
check((await q("SELECT count(*)::int n FROM pg_trigger WHERE tgname='guard_store_fill_owner' AND NOT tgisinternal"))[0].n, 1, 'rerun 133000 leaves one trigger');
await rejects(as(manager, 'UPDATE public.stores SET vat_type=$1 WHERE id=$2', ['general', S]), 'STORE_FILL_OWNER_REQUIRED', 'guard still active after rerun');

console.log(`PASS join/store-fill SQL: ${checks} checks (QA-JOINSTORE-20261128, local PGlite, no remote).`);
for (const k of known) console.log(`KNOWN  ${k}`);
