// Local PGlite only: no environment credentials or remote writes. QA-PAYROLL-V2-20261127.
// 급여 계산 2026-v2 마이그레이션 6개(20261127120000~125000)를 축약 스키마에 적용해 확인한다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db = new PGlite({ extensions: { pgcrypto } });
const owner = '00000000-0000-4000-8000-000000000001', stranger = '00000000-0000-4000-8000-000000000002';
const store = '00000000-0000-4000-8000-000000000010', other = '00000000-0000-4000-8000-000000000011';
const regular = '00000000-0000-4000-8000-000000000020', probe = '00000000-0000-4000-8000-000000000021', part = '00000000-0000-4000-8000-000000000022';
let checks = 0;
const check = (actual, expected, name) => { assert.deepEqual(actual, expected, name); checks++; };
const migration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
async function as(uid, sql, values = []) {
  await db.exec('BEGIN');
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [uid]);
    await db.exec('SET LOCAL ROLE authenticated');
    const result = await db.query(sql, values);
    await db.exec('COMMIT');
    return result.rows;
  } catch (error) { await db.exec('ROLLBACK'); throw error; }
}
async function rejects(promise, code, name) { await assert.rejects(promise, e => String(e.message).includes(code), name); checks++; }

await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA private;
 CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
 CREATE SCHEMA vault; CREATE TABLE vault.secrets(name text PRIMARY KEY, secret text, description text);
 CREATE VIEW vault.decrypted_secrets AS SELECT name, secret AS decrypted_secret FROM vault.secrets;
 CREATE FUNCTION vault.create_secret(s text, n text, d text) RETURNS uuid LANGUAGE sql AS $$INSERT INTO vault.secrets VALUES(n,s,d) RETURNING gen_random_uuid()$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA public,auth,private TO authenticated;
 CREATE TABLE public.stores(id uuid PRIMARY KEY, owner_id uuid, closing_time time);
 CREATE TABLE public.employees(id uuid PRIMARY KEY, store_id uuid REFERENCES public.stores(id), joined_at date, employment_type text,
   is_active boolean DEFAULT true, is_probation boolean DEFAULT false, probation_started_at date, is_resigned_during_probation boolean DEFAULT false,
   weekly_hours integer, user_id uuid, bank_name text, account_number text, hourly_wage numeric);
 CREATE TABLE public.store_join_profiles(member_id uuid PRIMARY KEY, store_id uuid, applicant_user_id uuid,
   account_number text NOT NULL CHECK(account_number ~ '^[0-9]{6,30}$'), reviewed_profile jsonb);
 CREATE FUNCTION public.is_store_admin(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM public.stores WHERE id=s AND owner_id=auth.uid())$$;
 CREATE FUNCTION public.is_store_member(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT public.is_store_admin(s)$$;
 CREATE FUNCTION public.can_read_store_financials(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT public.is_store_admin(s)$$;
 CREATE TABLE public.payroll(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, employee_id uuid, year_month text, gross numeric,
   applied_hourly_wage numeric, work_source text, regular_wage_snapshot jsonb, daily_work_snapshot jsonb,
   national_pension numeric, health_insurance numeric, long_term_care numeric, employment_insurance numeric, taxable_base numeric, withholding_tax numeric);
 CREATE FUNCTION public.regular_snapshot_gross(s jsonb, d date) RETURNS numeric LANGUAGE sql AS $$SELECT 0::numeric$$;
 CREATE TABLE public.payroll_daily_work(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, employee_id uuid, work_date date, gross numeric, status text,
   revision integer DEFAULT 0, worked_minutes integer, applied_hourly_wage numeric, record_source text, auto_applied_at timestamptz);
 CREATE TABLE private.attendance_work_sync(store_id uuid, employee_id uuid, work_date date, state text, source_snapshot jsonb, error_code text, updated_at timestamptz);
 CREATE TABLE public.toss_orders(store_id uuid, status text, order_at timestamptz, card_amount numeric, cash_amount numeric, total_amount numeric);
 CREATE TABLE public.manual_sales(store_id uuid, date date, card_amount numeric, cash_amount numeric);
 CREATE TABLE public.purchases(store_id uuid, date date, amount numeric);
 CREATE TABLE public.expenses(id uuid DEFAULT gen_random_uuid(), store_id uuid, category text, year_month text, amount numeric);
 CREATE TABLE public.recurring_fixed_expenses(id uuid, store_id uuid, source_expense_id uuid);
 CREATE TABLE public.recurring_fixed_expense_versions(rule_id uuid, effective_month text, revision integer, amount numeric, active boolean, end_month text);
 CREATE TABLE public.employee_wage_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, employee_id uuid, effective_date date, base_salary numeric,
   non_taxable numeric DEFAULT 0, created_at timestamptz DEFAULT now());`);

// 원본 함수(20261118150000) 정의만 올려 md5 가드가 통과하는지 확인한다.
const original = await migration('20261118150000_daily_work_labor_read_models.sql');
const fin = original.slice(original.indexOf('CREATE OR REPLACE FUNCTION public.get_financial_summaries_v2'), original.indexOf('END; $function$;') + 'END; $function$;'.length);
const lab = original.slice(original.indexOf('CREATE OR REPLACE FUNCTION public.get_daily_labor_sources'), original.indexOf('END $$;', original.indexOf('CREATE OR REPLACE FUNCTION public.get_daily_labor_sources')) + 'END $$;'.length);
await db.exec(fin); await db.exec(lab);

await db.query('INSERT INTO public.stores(id, owner_id) VALUES ($1,$2),($3,$4)', [store, owner, other, stranger]);
await db.query(`INSERT INTO public.employees(id, store_id, joined_at, employment_type, is_probation, probation_started_at, is_resigned_during_probation, weekly_hours, account_number) VALUES
  ($1,$4,'2026-01-01','regular',false,NULL,true,NULL,'110-123-456789'),
  ($2,$4,'2026-09-16','regular',true,NULL,false,NULL,'옛 메모 12'),
  ($3,$4,'2026-01-01','part_time',false,NULL,false,20,NULL)`, [regular, probe, part, store]);

for (const file of ['20261127120000_payroll_v2_employee_fields.sql', '20261127121000_daily_laborers.sql',
  '20261127122000_payroll_v2_labor_read_models.sql', '20261127123000_industrial_accident_rates.sql',
  '20261127124000_part_time_probation_daily_work.sql', '20261127125000_account_number_encryption.sql']) await db.exec(await migration(file));

// 1) 백필: 근로자 기본값, 시간→분, 수습 표시 직원만 61일.
const rows = (await db.query('SELECT id, income_type, weekly_minutes, probation_ends_on::text FROM public.employees ORDER BY id')).rows;
check(rows.map(r => [r.income_type, r.weekly_minutes, r.probation_ends_on]), [['employee', null, null], ['employee', null, '2026-11-15'], ['employee', 1200, null]], 'backfill');
// 2) 트리거: weekly_hours만 바꾸면 분도 맞추고, 분을 직접 주면 그대로 둔다.
await db.query('UPDATE public.employees SET weekly_hours=15 WHERE id=$1', [part]);
check((await db.query('SELECT weekly_minutes FROM public.employees WHERE id=$1', [part])).rows[0].weekly_minutes, 900, 'sync weekly_minutes');
await db.query('UPDATE public.employees SET weekly_minutes=950 WHERE id=$1', [part]);
check((await db.query('SELECT weekly_minutes FROM public.employees WHERE id=$1', [part])).rows[0].weekly_minutes, 950, 'explicit minutes kept');
await rejects(db.query("UPDATE public.employees SET income_type='daily' WHERE id=$1", [part]), 'employees_income_type_check', 'income type check');
await rejects(db.query('UPDATE public.stores SET default_probation_months=1, default_probation_days=10 WHERE id=$1', [store]), 'stores_default_probation_check', 'probation one-of');

// 3) 일용근로자: 관리자만, 매장 일치, 합계·지급 일관성.
const [laborer] = await as(owner, "INSERT INTO public.daily_laborers(store_id,name,weekday_wage) VALUES ($1,'QA 일용',150000) RETURNING id, revision", [store]);
check(laborer.revision, 0, 'laborer insert');
check((await as(stranger, 'SELECT id FROM public.daily_laborers')).length, 0, 'stranger cannot read laborers');
await rejects(as(stranger, "INSERT INTO public.daily_laborers(store_id,name) VALUES ($1,'x')", [store]), 'row-level security', 'stranger cannot insert');
const entrySql = `INSERT INTO public.daily_labor_entries(store_id,laborer_id,work_date,daily_wage,extra_pay,day_income_tax,employment_insurance,calculation_version)
  VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-v2') RETURNING id, gross, revision`;
const [entry] = await as(owner, entrySql, [store, laborer.id, '2026-10-03', 180000, 20000, 1350, 1800]);
check(entry.gross, 200000, 'generated gross');
await rejects(as(owner, entrySql, [store, laborer.id, '2026-10-03', 1, 0, 0, 0]), 'daily_labor_entries_one_per_day', 'one per day');
await rejects(db.query(entrySql, [other, laborer.id, '2026-10-05', 1, 0, 0, 0]), 'DAILY_LABOR_STORE_MISMATCH', 'store mismatch');
await rejects(as(owner, 'UPDATE public.daily_labor_entries SET payment_id=gen_random_uuid() WHERE id=$1', [entry.id]), 'DAILY_LABOR_PAYMENT_VIA_RPC', 'payment only via RPC');
await rejects(as(owner, 'INSERT INTO public.daily_labor_payments(store_id,laborer_id,paid_on,gross,income_tax,local_income_tax,employment_insurance,net_pay,calculation_version) VALUES ($1,$2,$3,1,0,0,0,1,$4)',
  [store, laborer.id, '2026-10-04', 'x']), 'permission denied', 'payments not writable directly');
// 지급 묶음: 남이 지급 처리 불가, 금액 합계는 서버가 정한다, 지급된 기록은 금액 수정·삭제 불가, 다시 지급 불가.
const payArgs = [store, laborer.id, [entry.id], '2026-10-04', 0, 0, 1800, '2026-v2'];
const paySql = 'SELECT public.record_daily_labor_payment($1,$2,$3::uuid[],$4::date,$5,$6,$7,$8) AS id';
await rejects(as(stranger, paySql, payArgs), 'DAILY_LABOR_FORBIDDEN', 'stranger cannot pay');
const [{ id: paymentId }] = await as(owner, paySql, payArgs);
const [payment] = await as(owner, 'SELECT gross, net_pay FROM public.daily_labor_payments WHERE id=$1', [paymentId]);
check([payment.gross, payment.net_pay], [200000, 198200], 'payment totals from entries');
await rejects(as(owner, paySql, payArgs), 'DAILY_LABOR_PAYMENT_CHANGED', 'cannot pay twice');
await rejects(as(owner, 'UPDATE public.daily_labor_entries SET extra_pay=0 WHERE id=$1', [entry.id]), 'DAILY_LABOR_PAID_LOCKED', 'paid amount locked');
await rejects(as(owner, 'DELETE FROM public.daily_labor_entries WHERE id=$1', [entry.id]), 'DAILY_LABOR_PAID_LOCKED', 'paid delete locked');
const [memo] = await as(owner, "UPDATE public.daily_labor_entries SET memo='QA' WHERE id=$1 RETURNING revision", [entry.id]);
check(memo.revision, 2, 'revision bump (payment link + memo)');
await as(owner, 'SELECT public.cancel_daily_labor_payment($1,$2)', [store, paymentId]);
check((await as(owner, 'SELECT payment_id FROM public.daily_labor_entries WHERE id=$1', [entry.id]))[0].payment_id, null, 'cancel unlinks');
check((await as(owner, 'SELECT canceled_at IS NOT NULL AS c FROM public.daily_labor_payments WHERE id=$1', [paymentId]))[0].c, true, 'cancel keeps record');
await as(owner, paySql, payArgs);  // 다시 지급(매장 삭제 연쇄 확인용으로 지급 상태를 남긴다)

// 4) 손익 함수: 수습 표시 직원만 날짜별 90%, 일용 세전 합계 포함.
await db.query(`INSERT INTO public.employee_wage_history(store_id,employee_id,effective_date,base_salary) VALUES ($1,$2,'2026-01-01',3000000),($1,$3,'2026-09-16',3000000)`, [store, regular, probe]);
await db.query(`DELETE FROM public.employees WHERE id=$1`, [part]);
const [summary] = await as(owner, "SELECT labor_cost::numeric FROM public.get_financial_summaries_v2(ARRAY[$1]::uuid[], ARRAY['2026-10'], true)", [store]);
// 정규직 3,000,000(중도퇴사 80% 없음) + 수습 직원 10월 전체 수습(9-16~11-15) 2,700,000 + 일용 200,000
check(Number(summary.labor_cost), 3000000 + 2700000 + 200000, 'summary probation + daily laborers');
// 수습 표시를 끄면 감액하지 않는다.
await db.query('UPDATE public.employees SET is_probation=false WHERE id=$1', [probe]);
const [unflagged] = await as(owner, "SELECT labor_cost::numeric FROM public.get_financial_summaries_v2(ARRAY[$1]::uuid[], ARRAY['2026-10'], true)", [store]);
check(Number(unflagged.labor_cost), 3000000 + 3000000 + 200000, 'unflagged employee is 100%');
await db.query('UPDATE public.employees SET is_probation=true WHERE id=$1', [probe]);
const [sources] = await as(owner, "SELECT public.get_daily_labor_sources($1,'2026-10') AS s", [store]);
check(sources.s.dailyLaborEntries, [{ store_id: store, work_date: '2026-10-03', gross: 200000 }], 'labor sources daily entries');
check(sources.s.employees.find(e => e.id === probe).probation_ends_on, '2026-11-15', 'labor sources probation field');
// 5) 산재 요율 표: 읽기만 가능.
check((await as(stranger, 'SELECT rate::text FROM public.industrial_accident_rates')).map(r => r.rate), ['0.008000'], 'rates readable');
await rejects(as(owner, "INSERT INTO public.industrial_accident_industries(code,name) VALUES ('x','x')"), 'permission denied', 'rates read-only');
// 6) 사업주 부담: 작성한 명세(3.3% 제외)와 일용 기록을 영업이익에서 뺀다.
await db.query(`INSERT INTO public.payroll(store_id,employee_id,year_month,gross,national_pension,health_insurance,long_term_care,employment_insurance,taxable_base,withholding_tax)
  VALUES ($1,$2,'2026-10',3000000,142500,107850,14170,27000,3000000,0)`, [store, regular]);
const [withPayroll] = await as(owner, "SELECT labor_cost::numeric, operating_profit::numeric FROM public.get_financial_summaries_v2(ARRAY[$1]::uuid[], ARRAY['2026-10'], true)", [store]);
// 근로자분과 같은 291,520 + 고용안정 0.25% 7,500 + 일용 고용보험 1,800 + 일용 고용안정 500 (산재: 업종 미선택)
check(Number(withPayroll.operating_profit), -Number(withPayroll.labor_cost) - (291520 + 7500 + 1800 + 500), 'employer burden subtracted');
await db.query("UPDATE public.stores SET industrial_accident_industry='retail_food_lodging' WHERE id=$1", [store]);
const [withAccident] = await as(owner, "SELECT labor_cost::numeric, operating_profit::numeric FROM public.get_financial_summaries_v2(ARRAY[$1]::uuid[], ARRAY['2026-10'], true)", [store]);
// 산재 0.95%: 명세 3,000,000 → 28,500, 일용 200,000 → 1,900
check(Number(withAccident.operating_profit), Number(withPayroll.operating_profit) - 28500 - 1900, 'accident included when industry chosen');
await db.query("UPDATE public.employer_insurance_rates SET effective_from='2019-01-01', effective_to='2026-09-30'");
const [noRate] = await as(owner, "SELECT labor_cost::numeric, operating_profit FROM public.get_financial_summaries_v2(ARRAY[$1]::uuid[], ARRAY['2026-10'], true)", [store]);
check([noRate.labor_cost === null, noRate.operating_profit], [false, null], 'missing stability rate → operating profit unknown');
await db.query("UPDATE public.employer_insurance_rates SET effective_to='2026-12-31'");

// 7) 파트타이머 수습 90%: 새 기록만, 수습 기간 안 날짜만, 이미 있는 행은 다시 곱하지 않는다.
await db.query(`INSERT INTO public.employees(id, store_id, joined_at, employment_type, is_probation, probation_ends_on) VALUES ($1,$2,'2026-10-01','part_time',true,'2026-12-31')`, [part, store]);
const dwSql = `INSERT INTO public.payroll_daily_work(store_id,employee_id,work_date,worked_minutes,applied_hourly_wage,gross,status) VALUES ($1,$2,$3,$4::int,$5::numeric,round($4::int*$5::numeric/60),'pending')
  ON CONFLICT DO NOTHING RETURNING applied_hourly_wage::numeric, gross::numeric`;
await db.exec('CREATE UNIQUE INDEX ON public.payroll_daily_work(employee_id, work_date)');
const [inProbation] = (await db.query(dwSql, [store, part, '2026-10-05', 240, 12000])).rows;
check([Number(inProbation.applied_hourly_wage), Number(inProbation.gross)], [10800, 43200], 'probation day 90%');
const [afterProbation] = (await db.query(dwSql, [store, part, '2027-01-05', 240, 12000])).rows;
check(Number(afterProbation.gross), 48000, 'after probation 100%');
const upsert = `INSERT INTO public.payroll_daily_work(store_id,employee_id,work_date,worked_minutes,applied_hourly_wage,gross,status) VALUES ($1,$2,'2026-10-05',300,10800,54000,'pending')
  ON CONFLICT (employee_id, work_date) DO UPDATE SET worked_minutes=excluded.worked_minutes, gross=excluded.gross RETURNING applied_hourly_wage::numeric, gross::numeric`;
const [reUpsert] = (await db.query(upsert, [store, part])).rows;
check([Number(reUpsert.applied_hourly_wage), Number(reUpsert.gross)], [10800, 54000], 'existing row not reduced twice');
await db.query("UPDATE public.payroll_daily_work SET status='approved' WHERE employee_id=$1", [part]);
check(Number((await db.query("SELECT applied_hourly_wage::numeric FROM public.payroll_daily_work WHERE employee_id=$1 AND work_date='2026-10-05'", [part])).rows[0].applied_hourly_wage), 10800, 'status change keeps rate');

// 8) 계좌번호 암호화: 평문을 남기지 않고 끝 4자리만, 열람은 권한자만.
const [backfilled] = (await db.query('SELECT account_number, account_last4 FROM public.employees WHERE id=$1', [regular])).rows;
check([backfilled.account_number.startsWith('enc:v1:6789:'), backfilled.account_last4, backfilled.account_number.includes('123456789')], [true, '6789', false], 'employee backfill encrypted');
await db.query("UPDATE public.daily_laborers SET account_number='333-22-1111' WHERE id=$1", [laborer.id]);
check((await db.query('SELECT account_last4 FROM public.daily_laborers WHERE id=$1', [laborer.id])).rows[0].account_last4, '1111', 'laborer encrypted');
check((await as(owner, "SELECT public.reveal_account_number('employee',$1) AS n", [regular]))[0].n, '110123456789', 'owner reveals employee');
check((await as(owner, "SELECT public.reveal_account_number('daily_laborer',$1) AS n", [laborer.id]))[0].n, '333221111', 'owner reveals laborer');
await rejects(as(stranger, "SELECT public.reveal_account_number('employee',$1)", [regular]), 'ACCOUNT_NUMBER_FORBIDDEN', 'stranger cannot reveal');
check((await as(owner, "SELECT public.reveal_account_number('employee',$1) AS n", [probe]))[0].n, '옛 메모 12', 'invalid legacy value preserved encrypted');
await db.query("UPDATE public.employees SET is_active=true WHERE id=$1", [probe]);  // 다른 열 수정은 옛 값을 막지 않는다
await db.query("UPDATE public.employees SET user_id=$1 WHERE id=$2", [stranger, probe]);
await db.query("UPDATE public.employees SET account_number='9876543210' WHERE id=$1", [probe]);
check((await as(stranger, "SELECT public.reveal_account_number('employee',$1) AS n", [probe]))[0].n, '9876543210', 'employee reveals own');
// 합류 신청: 평문 검사를 토큰 검사로 바꾸고, 검토본(jsonb)과 직원 복사 경로도 토큰으로 이어진다.
const member = '00000000-0000-4000-8000-000000000030';
await db.query(`INSERT INTO public.store_join_profiles(member_id,store_id,applicant_user_id,account_number,reviewed_profile) VALUES ($1,$2,$3,'1002-333-444555',$4)`,
  [member, store, stranger, JSON.stringify({ account_number: '1002333444555', bank_name: 'QA' })]);
const [jp] = (await db.query('SELECT account_number, reviewed_profile, account_last4 FROM public.store_join_profiles WHERE member_id=$1', [member])).rows;
check([jp.account_number.startsWith('enc:v1:4555:'), jp.reviewed_profile.account_number.startsWith('enc:v1:4555:'), jp.account_last4], [true, true, '4555'], 'join profile encrypted');
await db.query('UPDATE public.employees SET account_number=$1 WHERE id=$2', [jp.reviewed_profile.account_number, part]);
check((await as(owner, "SELECT public.reveal_account_number('employee',$1) AS n", [part]))[0].n, '1002333444555', 'token copied into employee decrypts');
check((await as(stranger, "SELECT public.reveal_account_number('join_profile',$1) AS n", [member]))[0].n, '1002333444555', 'applicant reveals own submission');
await rejects(db.query("UPDATE public.employees SET account_number='12' WHERE id=$1", [part]), 'ACCOUNT_NUMBER_INVALID', 'invalid account rejected');
check((await db.query("SELECT count(*)::int AS n FROM public.employees WHERE account_number ~ '^[0-9-]+$'")).rows[0].n, 0, 'no plaintext left');

// 9) 가드: 이미 적용한 뒤 다시 실행하면 멈춘다.
await rejects(db.exec(await migration('20261127122000_payroll_v2_labor_read_models.sql')), 'LABOR_READ_MODEL_CHANGED_SINCE_REVIEW', 'guard on rerun');
await db.exec('ROLLBACK');  // 실패한 마이그레이션의 BEGIN을 닫는다.

// 10) 매장 삭제 연쇄: 지급된 일용 기록이 있어도 매장을 지우면 함께 지워진다.
await db.query('DELETE FROM public.payroll WHERE store_id=$1', [store]);
await db.query('DELETE FROM public.store_join_profiles WHERE store_id=$1', [store]);
await db.query('DELETE FROM public.payroll_daily_work WHERE store_id=$1', [store]);
await db.query('DELETE FROM public.employee_wage_history WHERE store_id=$1', [store]);
await db.query('DELETE FROM public.employees WHERE store_id=$1', [store]);
await db.query('DELETE FROM public.stores WHERE id=$1', [store]);
check((await db.query('SELECT (SELECT count(*) FROM public.daily_labor_entries)::int e, (SELECT count(*) FROM public.daily_labor_payments)::int p, (SELECT count(*) FROM public.daily_laborers)::int l')).rows[0], { e: 0, p: 0, l: 0 }, 'store cascade');

console.log(`PASS payroll v2 SQL: ${checks} checks (QA-PAYROLL-V2-20261127, local PGlite, no remote).`);
