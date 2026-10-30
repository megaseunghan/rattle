// 로컬 PGlite 전용. 실제 Supabase 연결·환경변수·운영 데이터는 사용하지 않는다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.RATTLE_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const ids = { admin: '00000000-0000-0000-0000-000000000001', a: '00000000-0000-0000-0000-000000000002', b: '00000000-0000-0000-0000-000000000003',
  store: '00000000-0000-0000-0000-000000000004', employee: '00000000-0000-0000-0000-000000000005' };
let checks = 0;
function check(label, actual, expected) { assert.deepEqual(actual, expected, label); checks++; }
async function as(user, sql, params = []) {
  await db.exec('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user]);
  try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); }
}
async function rejected(label, user, sql, params = []) {
  await assert.rejects(() => as(user, sql, params), undefined, label); checks++;
}
try {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    CREATE TABLE stores(id uuid PRIMARY KEY, owner_id uuid, closing_time time DEFAULT '23:00', name text DEFAULT '테스트 매장', business_number text);
    CREATE TABLE store_members(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, status text, role text, applicant_name text, phone text, user_email text, created_at timestamptz DEFAULT now(), UNIQUE(store_id,user_id));
    ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;
    CREATE TABLE employees(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, name text DEFAULT '', phone text, joined_at date, base_salary numeric DEFAULT 0, store_id uuid REFERENCES stores(id), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, employment_type text DEFAULT 'regular', is_active boolean DEFAULT true);
    CREATE FUNCTION is_store_member(s uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid()) OR EXISTS(SELECT 1 FROM store_members WHERE store_id=s AND user_id=auth.uid() AND status='approved') $$;
    CREATE FUNCTION is_store_admin(s uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid()) OR EXISTS(SELECT 1 FROM store_members WHERE store_id=s AND user_id=auth.uid() AND status='approved' AND role='admin') $$;
    CREATE TABLE attendance(store_id uuid, employee_id uuid, timestamp timestamptz, worked_minutes integer, daily_wage numeric, type text);
    CREATE TABLE purchases(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid REFERENCES stores(id), type text CHECK(type IN ('쿠팡','네이버','수기')), amount numeric DEFAULT 0);
    GRANT SELECT, INSERT, UPDATE, DELETE ON stores, employees, purchases TO authenticated;
    CREATE UNIQUE INDEX uq_employees_store_user ON employees(store_id,user_id) WHERE user_id IS NOT NULL;
    CREATE POLICY store_members_select ON store_members FOR SELECT USING(user_id=auth.uid() OR is_store_admin(store_id));
    CREATE POLICY store_members_update ON store_members FOR UPDATE USING(is_store_admin(store_id));
    CREATE POLICY store_members_delete ON store_members FOR DELETE USING(user_id=auth.uid() OR is_store_admin(store_id));
    GRANT SELECT, INSERT, UPDATE, DELETE ON store_members TO authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260602_employees_payroll.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260914_payroll_settlement.sql', import.meta.url), 'utf8'));
  await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON payroll TO authenticated');
  for (const file of ['20261016_manual_work_minutes.sql', '20261018_part_time_minutes_settlement.sql', '20261019_home_alert_reads.sql', '20261019_purchase_types.sql', '20261019_payroll_submissions.sql', '20261019_member_employee_auto_link.sql']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }

const employeePolicySql=await readFile(new URL('../supabase/migrations/20260608_role_based_rls.sql',import.meta.url),'utf8');
await db.exec(employeePolicySql.slice(employeePolicySql.indexOf('DROP POLICY IF EXISTS "employees_store_member"')));


await db.exec('ALTER TABLE employees ADD COLUMN hourly_wage numeric, ADD COLUMN non_taxable numeric DEFAULT 0');
await db.exec(await readFile(new URL('../supabase/migrations/20260608_wage_history.sql',import.meta.url),'utf8'));
await db.exec("ALTER TABLE purchases ADD COLUMN date date, ADD COLUMN supplier text, ADD COLUMN category text, ADD COLUMN note text; CREATE TABLE ingredients(id uuid PRIMARY KEY,store_id uuid REFERENCES stores(id),current_stock numeric DEFAULT 0,last_price numeric DEFAULT 0,updated_at timestamptz); ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY; CREATE POLICY ingredient_member ON ingredients USING(is_store_member(store_id)); GRANT SELECT ON ingredients TO authenticated;");
await db.exec(await readFile(new URL('../supabase/migrations/20260609_purchase_items.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/20260902_purchase_consolidation.sql',import.meta.url),'utf8'));
await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON employee_wage_history,payroll_work_history,purchase_items TO authenticated');
await db.exec('CREATE TABLE recipes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid REFERENCES stores(id)); CREATE TABLE recipe_ingredients(recipe_id uuid REFERENCES recipes(id),ingredient_id uuid REFERENCES ingredients(id)); GRANT SELECT,INSERT,UPDATE,DELETE ON recipes,recipe_ingredients TO authenticated');
await db.exec(await readFile(new URL('../supabase/migrations/20261020_01_access_and_purchase_integrity.sql',import.meta.url),'utf8'));

await db.exec("ALTER TABLE stores ADD COLUMN toss_merchant_id text; CREATE TABLE auth.identities(user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,provider text,provider_id text,identity_data jsonb); CREATE TABLE cleaning_logs(id uuid DEFAULT gen_random_uuid(),checked_by uuid NOT NULL REFERENCES auth.users(id),checked_by_name text NOT NULL); CREATE TABLE manual_sales(id uuid DEFAULT gen_random_uuid(),created_by uuid REFERENCES auth.users(id)); CREATE TABLE schedule_requests(id uuid DEFAULT gen_random_uuid(),reviewed_by uuid REFERENCES auth.users(id)); CREATE TABLE attendance_corrections(id uuid DEFAULT gen_random_uuid(),reviewed_by uuid REFERENCES auth.users(id));");
await db.exec(await readFile(new URL('../supabase/migrations/20260811_toss_webhook_matching.sql',import.meta.url),'utf8'));
for(const file of ['20261020_02_account_deletion.sql','20261020_03_webhook_transaction.sql']) {
 await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
}
await db.query('INSERT INTO auth.users(id) SELECT unnest($1::uuid[])',[[ids.admin,ids.a,ids.b]]);
await db.query('INSERT INTO stores(id,owner_id) VALUES($1,$2)',[ids.store,ids.admin]);
await db.query("INSERT INTO store_members(store_id,user_id,status,role) SELECT $1,unnest($2::uuid[]),'approved','member'",[ids.store,[ids.a,ids.b]]);
await as(ids.admin,"INSERT INTO employees(id,store_id,user_id,employment_type,base_salary) VALUES($1,$2,$3,'part_time',10000)",[ids.employee,ids.store,ids.a]);
const changed=await as(ids.b,'UPDATE employees SET base_salary=99999 WHERE id=$1 RETURNING base_salary',[ids.employee]);
check('일반 직원의 타인 기본급 수정 차단',changed.rows.length,0);
const regular=(await as(ids.admin,"INSERT INTO employees(store_id,user_id,employment_type) VALUES($1,$2,'regular') RETURNING id",[ids.store,ids.b])).rows[0].id;
await as(ids.admin,"INSERT INTO payroll(store_id,employee_id,year_month,gross,net_pay) VALUES($1,$2,'2026-10',3000000,2700000)",[ids.store,regular]);
const read=await as(ids.a,'SELECT gross,net_pay FROM payroll WHERE employee_id=$1',[regular]);
check('일반 직원의 타인 급여 조회 차단',read.rows.length,0);
await db.exec('GRANT SELECT ON payroll_work_history TO authenticated');
check('일반 직원의 타인 이력 조회 차단',(await as(ids.a,'SELECT * FROM payroll_work_history WHERE employee_id=$1',[regular])).rows.length,0);
const otherStore='00000000-0000-0000-0000-000000000010',ingredient='00000000-0000-0000-0000-000000000011';
await db.query('INSERT INTO stores(id,owner_id) VALUES($1,$2)',[otherStore,ids.admin]);
await db.query('INSERT INTO ingredients(id,store_id,current_stock) VALUES($1,$2,10)',[ingredient,otherStore]);
check('일반 직원은 다른 매장 재고 조회 불가',(await as(ids.a,'SELECT * FROM ingredients WHERE id=$1',[ingredient])).rows.length,0);

const create='SELECT create_purchase_with_items($1,current_date,\'fixture\',\'수기\',$2::jsonb)';
const foreign={ingredient_id:ingredient,name:'fixture',quantity:5,unit:'개',unit_price:100,category:'기타'};
await rejected('다른 매장 재고 우회 수정 차단',ids.a,create,[ids.store,JSON.stringify([foreign])]);
check('실패 시 매입 전체 롤백',Number((await db.query('SELECT count(*) n FROM purchases')).rows[0].n),0);
check('다른 매장 재고 보존',Number((await db.query('SELECT current_stock FROM ingredients WHERE id=$1',[ingredient])).rows[0].current_stock),10);
const own='00000000-0000-0000-0000-000000000012';
await db.query('INSERT INTO ingredients(id,store_id,current_stock) VALUES($1,$2,10)',[own,ids.store]);
const item={...foreign,ingredient_id:own};
await rejected('정상 품목 다음에 다른 매장 품목이 있어도 전체 롤백',ids.a,create,[ids.store,JSON.stringify([item,foreign])]);
check('앞 품목 재고도 롤백',Number((await db.query('SELECT current_stock FROM ingredients WHERE id=$1',[own])).rows[0].current_stock),10);
for(const patch of [{quantity:0},{quantity:-1},{quantity:'NaN'},{quantity:null},{unit_price:-1},{name:''}]) {
 await rejected('잘못된 품목 차단',ids.a,create,[ids.store,JSON.stringify([{...item,...patch}])]);
}
await rejected('빈 매입 차단',ids.a,create,[ids.store,'[]']);
await as(ids.a,create,[ids.store,JSON.stringify([item])]);
check('같은 매장 정상 입고',Number((await db.query('SELECT current_stock FROM ingredients WHERE id=$1',[own])).rows[0].current_stock),15);
const line=(await db.query('SELECT id FROM purchase_items')).rows[0].id;
await as(ids.a,'SELECT update_purchase_item($1,7,200)',[line]);
await as(ids.a,'SELECT update_purchase_item($1,8,300)',[line]);
check('연속 수정 재고 차액',Number((await db.query('SELECT current_stock FROM ingredients WHERE id=$1',[own])).rows[0].current_stock),18);
check('연속 수정 매입 합계',Number((await db.query('SELECT amount FROM purchases')).rows[0].amount),2400);
await rejected('직접 품목 연결 변경도 차단',ids.a,'UPDATE purchase_items SET ingredient_id=$1 WHERE id=$2',[ingredient,line]);
check('본인 직원 조회 허용',(await as(ids.a,'SELECT id FROM employees')).rows.length,1);
check('관리자 전체 직원 조회 허용',(await as(ids.admin,'SELECT id FROM employees')).rows.length,2);
check('본인 급여 조회 허용',(await as(ids.b,'SELECT * FROM payroll')).rows.length,1);
await as(ids.admin,'UPDATE employees SET is_active=false WHERE id=$1',[regular]);
check('퇴사 직원의 자기 급여 조회 차단',(await as(ids.b,'SELECT * FROM payroll')).rows.length,0);
await db.query('UPDATE store_members SET status=\'pending\' WHERE user_id=$1',[ids.a]);
check('미승인 직원 조회 차단',(await as(ids.a,'SELECT id FROM employees')).rows.length,0);


const recipe=(await db.query('INSERT INTO recipes(store_id) VALUES($1) RETURNING id',[ids.store])).rows[0].id;
await rejected('다른 매장 레시피 재료 연결 차단',ids.a,'INSERT INTO recipe_ingredients(recipe_id,ingredient_id) VALUES($1,$2)',[recipe,ingredient]);
await as(ids.a,'INSERT INTO recipe_ingredients(recipe_id,ingredient_id) VALUES($1,$2)',[recipe,own]);
check('같은 매장 레시피 재료 허용',(await db.query('SELECT * FROM recipe_ingredients')).rows.length,1);
await rejected('레시피 재료 수정 우회 차단',ids.a,'UPDATE recipe_ingredients SET ingredient_id=$1',[ingredient]);
await rejected('직원 손익 전체 조회 차단',ids.a,'SELECT assert_store_finance_access($1)',[ids.store]);
await as(ids.admin,'SELECT assert_store_finance_access($1)',[ids.store]); checks++;
// 인사·급여 정책의 본인/관리자/다른 매장/미승인/퇴사 경계.
await as(ids.admin,"UPDATE store_members SET status='approved' WHERE user_id=$1",[ids.a]);
await as(ids.admin,'INSERT INTO employee_wage_history(store_id,employee_id,effective_date,base_salary) VALUES($1,$2,current_date,10000)',[ids.store,ids.employee]);
check('본인 시급 이력 조회 허용',(await as(ids.a,'SELECT * FROM employee_wage_history')).rows.length,1);
check('타인 시급 이력 조회 차단',(await as(ids.b,'SELECT * FROM employee_wage_history')).rows.length,0);
await rejected('직원 시급 이력 추가 차단',ids.a,'INSERT INTO employee_wage_history(store_id,employee_id,effective_date,base_salary) VALUES($1,$2,current_date,99999)',[ids.store,ids.employee]);
check('직원 기본급 직접 수정 차단',(await as(ids.a,'UPDATE employees SET base_salary=99999 RETURNING id')).rows.length,0);
await rejected('직원 직접 등록 차단',ids.a,"INSERT INTO employees(store_id,name) VALUES($1,'unauthorized')",[ids.store]);
await db.exec('GRANT SELECT ON employees,payroll,payroll_work_history,employee_wage_history TO anon; SET ROLE anon');
check('비로그인 급여 조회 차단',(await db.query('SELECT * FROM payroll')).rows.length,0);
await db.exec('RESET ROLE');

// 소유권·Auth 삭제·업무 보존·외부 연결 해제 기록은 트랜잭션 안에서 검증한다.
await rejected('소유자 탈퇴 사전 차단',ids.admin,'SELECT assert_account_deletable()');
await assert.rejects(()=>db.query('DELETE FROM auth.users WHERE id=$1',[ids.admin]),/ACCOUNT_OWNS_STORES/); checks++;
check('차단된 소유자 계정 보존',(await db.query('SELECT id FROM auth.users WHERE id=$1',[ids.admin])).rows.length,1);
await rejected('일반 멤버 소유권 이전 차단',ids.a,'SELECT transfer_store_ownership($1,$2)',[ids.store,(await db.query('SELECT id FROM store_members WHERE user_id=$1',[ids.b])).rows[0].id]);
const memberA=(await db.query('SELECT id FROM store_members WHERE user_id=$1',[ids.a])).rows[0].id;
await db.query("UPDATE store_members SET status='pending' WHERE id=$1",[memberA]);
await rejected('미승인 멤버에게 이전 차단',ids.admin,'SELECT transfer_store_ownership($1,$2)',[ids.store,memberA]);
await as(ids.admin,"UPDATE store_members SET status='approved' WHERE id=$1",[memberA]);
await as(ids.admin,'SELECT transfer_store_ownership($1,$2)',[ids.store,memberA]);
check('승인된 멤버에게 소유권 이전',(await db.query('SELECT owner_id FROM stores WHERE id=$1',[ids.store])).rows[0].owner_id,ids.a);
check('새 소유자 관리자 역할',(await db.query('SELECT role FROM store_members WHERE id=$1',[memberA])).rows[0].role,'admin');
// 원래 소유자는 다른 매장도 소유하므로 아직 탈퇴할 수 없다.
await rejected('다른 소유 매장이 남아 있으면 탈퇴 차단',ids.admin,'SELECT assert_account_deletable()');
await as(ids.b,'SELECT assert_account_deletable()');
await db.query("INSERT INTO auth.identities VALUES($1,'kakao','kakao-fixture','{\"sub\":\"kakao-fixture\"}')",[ids.b]);
await db.query("INSERT INTO cleaning_logs(checked_by,checked_by_name) VALUES($1,'fixture')",[ids.b]);
await db.query('INSERT INTO manual_sales(created_by) VALUES($1)',[ids.b]);
await db.query('INSERT INTO schedule_requests(reviewed_by) VALUES($1)',[ids.b]);
await db.query('INSERT INTO attendance_corrections(reviewed_by) VALUES($1)',[ids.b]);
await db.query('DELETE FROM auth.users WHERE id=$1',[ids.b]);
check('탈퇴는 매장을 지우지 않음',(await db.query('SELECT id FROM stores')).rows.length,2);
check('탈퇴는 급여를 지우지 않음',(await db.query('SELECT id FROM payroll')).rows.length,1);
check('탈퇴는 직원 계정만 연결 해제',(await db.query('SELECT user_id FROM employees WHERE id=$1',[regular])).rows[0].user_id,null);
check('청소 이력 익명 연결 해제',(await db.query('SELECT checked_by,checked_by_name FROM cleaning_logs')).rows[0],{checked_by:null,checked_by_name:'탈퇴한 사용자'});
check('수기 매출 기록 보존',(await db.query('SELECT created_by FROM manual_sales')).rows[0].created_by,null);
check('외부 연결 해제 항목 생성',(await db.query('SELECT provider_subject FROM account_unlink_jobs')).rows[0].provider_subject,'kakao-fixture');
check('삭제 계정의 남은 JWT로 급여 접근 차단',(await as(ids.b,'SELECT * FROM payroll')).rows.length,0);
await rejected('일반 직원 재처리 자료 조회 차단',ids.a,'SELECT * FROM account_unlink_jobs');
await rejected('일반 직원 재처리 실행 차단',ids.a,'SELECT * FROM claim_account_unlinks(NULL)');
await db.exec('SET ROLE service_role');
check('서비스 재처리 선점',(await db.query('SELECT * FROM claim_account_unlinks(NULL)')).rows.length,1);
check('동일 작업의 즉시 중복 선점 차단',(await db.query('SELECT * FROM claim_account_unlinks(NULL)')).rows.length,0);
await db.exec('RESET ROLE');

const webhook="SELECT process_toss_webhook($1,$2,$3,$4::jsonb) result";
const install='app.installation.created.v1',uninstall='app.installation.deleted.v1';
await rejected('직원 웹훅 RPC 실행 차단',ids.a,webhook,['e0',install,'m1','{}']);
await rejected('직원 웹훅 원문 조회 차단',ids.a,'SELECT * FROM toss_pending_installations');
await db.exec('SET ROLE service_role');
let processed=(await db.query(webhook,['e1',install,'m1','{}'])).rows[0].result;
check('미매칭 설치 저장 성공',processed.duplicated,false);
check('중복 이벤트 재수신 생략',(await db.query(webhook,['e1',install,'m1','{}'])).rows[0].result.duplicated,true);
await db.exec('RESET ROLE');
check('설치 큐 한 건 유지',(await db.query('SELECT * FROM toss_pending_installations')).rows.length,1);
// 큐 저장을 실패시켜 중복 방지 정보가 함께 롤백되는지 확인한다.
await db.exec("CREATE FUNCTION fixture_fail_queue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.toss_merchant_id='fail' THEN RAISE EXCEPTION 'fixture_queue_failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_fail_queue BEFORE INSERT ON toss_pending_installations FOR EACH ROW EXECUTE FUNCTION fixture_fail_queue(); SET ROLE service_role");
await assert.rejects(()=>db.query(webhook,['e-fail',install,'fail','{}']),/fixture_queue_failure/); checks++;
await db.exec('RESET ROLE');
check('저장 실패 시 중복 방지 기록도 롤백',(await db.query("SELECT * FROM toss_webhook_events WHERE event_id='e-fail'")).rows.length,0);
await db.exec('DROP TRIGGER fixture_fail_queue ON toss_pending_installations; SET ROLE service_role');
check('같은 이벤트 재시도 성공',(await db.query(webhook,['e-fail',install,'fail','{}'])).rows[0].result.duplicated,false);
await db.exec('RESET ROLE');
await db.query("UPDATE stores SET business_number='1234567890' WHERE id=$1",[ids.store]);
await db.exec('SET ROLE service_role');
await db.query(webhook,['e2',install,'matched',JSON.stringify({data:{merchant:{businessNumber:'123-45-67890'}}})]);
await db.exec('RESET ROLE');
check('사업자번호 단일 매장 매칭',(await db.query('SELECT toss_merchant_id FROM stores WHERE id=$1',[ids.store])).rows[0].toss_merchant_id,'matched');
await db.exec('SET ROLE service_role');
await db.query(webhook,['e3',uninstall,'matched','{}']);
await db.exec('RESET ROLE');
check('설치 해제 반영',(await db.query('SELECT toss_merchant_id FROM stores WHERE id=$1',[ids.store])).rows[0].toss_merchant_id,null);

// 홈 공유 요약: 직원 개인 급여 RLS를 유지하면서 매장 합계만 제공한다.
await db.exec(`
  ALTER TABLE employees ADD COLUMN is_resigned_during_probation boolean DEFAULT false;
  ALTER TABLE manual_sales ADD COLUMN store_id uuid, ADD COLUMN date date, ADD COLUMN card_amount numeric, ADD COLUMN cash_amount numeric;
  CREATE TABLE toss_orders(store_id uuid,order_at timestamptz,status text,total_amount numeric,card_amount numeric,cash_amount numeric);
  CREATE TABLE expenses(store_id uuid,year_month text,category text,amount numeric);
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261021_home_financial_summary.sql',import.meta.url),'utf8'));
const homeOwner='00000000-0000-0000-0000-000000000101';
const homeMember='00000000-0000-0000-0000-000000000102';
const homePending='00000000-0000-0000-0000-000000000103';
const homeStore='00000000-0000-0000-0000-000000000104';
await db.query('INSERT INTO auth.users(id) SELECT unnest($1::uuid[])',[[homeOwner,homeMember,homePending]]);
await db.query('INSERT INTO stores(id,owner_id) VALUES($1,$2)',[homeStore,homeOwner]);
await db.query("INSERT INTO store_members(store_id,user_id,status,role) VALUES($1,$2,'approved','member'),($1,$3,'pending','member')",[homeStore,homeMember,homePending]);
const reg=(await as(homeOwner,"INSERT INTO employees(store_id,name,employment_type) VALUES($1,'정규직','regular') RETURNING id",[homeStore])).rows[0].id;
const pt=(await as(homeOwner,"INSERT INTO employees(store_id,name,employment_type,is_active) VALUES($1,'퇴사 파트','part_time',false) RETURNING id",[homeStore])).rows[0].id;
await db.query("INSERT INTO employee_wage_history(store_id,employee_id,effective_date,base_salary) VALUES($1,$2,'2020-01-01',3100000),($1,$2,'2020-01-16',6200000)",[homeStore,reg]);
await as(homeOwner,"INSERT INTO payroll(store_id,employee_id,year_month,gross,net_pay) VALUES($1,$2,'2020-01',100000,90000)",[homeStore,pt]);
await db.query("INSERT INTO toss_orders VALUES($1,'2020-01-10T12:00:00Z','COMPLETED',10000000,8000000,2000000),($1,'2020-01-11T12:00:00Z','CANCELLED',999999,999999,0)",[homeStore]);
await db.query("INSERT INTO manual_sales(store_id,date,card_amount,cash_amount) VALUES($1,'2020-01-11',1000000,500000)",[homeStore]);
await db.query("INSERT INTO purchases(store_id,type,date,amount) VALUES($1,'수기','2020-01-10',1000000)",[homeStore]);
await db.query("INSERT INTO expenses VALUES($1,'2019-12','고정비',500000),($1,'2020-01','공과금',200000)",[homeStore]);
const summarySql='SELECT * FROM get_home_financial_summary($1,$2)';
const summary=(await as(homeMember,summarySql,[homeStore,'2020-01'])).rows[0];
check('직원 매출 요약',Number(summary.revenue),11500000);
check('직원 매입 요약',Number(summary.purchase_cost),1000000);
check('정규직 인상 일할 및 퇴사 파트 급여 합계',Number(summary.labor_cost),4800000);
check('직전 월 고정비 이어받기',Number(summary.fixed_expense),500000);
check('공과금과 카드 수수료 포함',Number(summary.variable_expense),312500);
check('영업이익 산식',Number(summary.operating_profit),4887500);
check('사장·직원 홈 요약 동일',(await as(homeOwner,summarySql,[homeStore,'2020-01'])).rows[0],summary);
check('홈 요약에 개인 급여 필드 없음',Object.keys(summary).sort(),['year_month','revenue','purchase_cost','labor_cost','fixed_expense','variable_expense','operating_profit'].sort());
check('요약 공개 후 타인 급여 비공개 유지',(await as(homeMember,'SELECT * FROM payroll WHERE employee_id=$1',[pt])).rows.length,0);
check('요약 공개 후 타인 직원 정보 비공개 유지',(await as(homeMember,'SELECT * FROM employees WHERE id=$1',[reg])).rows.length,0);
await rejected('상세 손익은 여전히 관리자 전용',homeMember,'SELECT assert_store_finance_access($1)',[homeStore]);
await rejected('승인 대기 직원 요약 차단',homePending,summarySql,[homeStore,'2020-01']);
await rejected('타 매장 요약 차단',homeMember,summarySql,[ids.store,'2020-01']);
await rejected('잘못된 월 차단',homeMember,summarySql,[homeStore,'2020-13']);
await db.exec('SET ROLE anon');
await assert.rejects(()=>db.query(summarySql,[homeStore,'2020-01'])); checks++;
await db.exec('RESET ROLE');
check('미래 월의 미발생 정규직 비용 제외',Number((await as(homeMember,summarySql,[homeStore,'2099-01'])).rows[0].labor_cost),0);
await db.query("INSERT INTO expenses VALUES($1,'2020-01','고정비',600000)",[homeStore]);
check('당월 고정비가 있으면 과거분 중복 안 함',Number((await as(homeMember,summarySql,[homeStore,'2020-01'])).rows[0].fixed_expense),600000);
console.log(JSON.stringify({localOnly:true,syntheticData:true,checks}));
} catch(error) { console.error(error.message); process.exitCode=1; } finally {await db.close();}
