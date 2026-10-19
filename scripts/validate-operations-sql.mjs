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
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    CREATE TABLE stores(id uuid PRIMARY KEY, owner_id uuid, closing_time time DEFAULT '23:00', name text DEFAULT '테스트 매장', business_number text);
    CREATE TABLE store_members(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid, user_id uuid, status text, role text, applicant_name text, phone text, user_email text, created_at timestamptz DEFAULT now(), UNIQUE(store_id,user_id));
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
  await db.query('INSERT INTO auth.users(id) SELECT unnest($1::uuid[])', [[ids.admin, ids.a, ids.b]]);
  await db.query('INSERT INTO stores(id,owner_id) VALUES($1,$2)', [ids.store, ids.admin]);
  await db.query("INSERT INTO store_members(store_id,user_id,status,role) SELECT $1,unnest($2::uuid[]),'approved','member'", [ids.store, [ids.a, ids.b]]);
  await as(ids.admin, "INSERT INTO employees(id,store_id,user_id,employment_type) VALUES($1,$2,$3,'part_time')", [ids.employee, ids.store, ids.a]);
  await as(ids.a, 'INSERT INTO home_alert_reads(store_id,user_id,alert_key) VALUES($1,$2,$3)', [ids.store, ids.a, 'stock:fixture:1']);
  check('읽음 상태는 본인만 조회', (await as(ids.a, 'SELECT * FROM home_alert_reads')).rows.length, 1);
  check('다른 사용자에게 읽음 전파 안 함', (await as(ids.b, 'SELECT * FROM home_alert_reads')).rows.length, 0);
  await rejected('타인 읽음 위조 차단', ids.b, 'INSERT INTO home_alert_reads(store_id,user_id,alert_key) VALUES($1,$2,$3)', [ids.store, ids.a, 'stock:fixture:2']);
  await as(ids.admin, 'SELECT change_purchase_type($1,NULL,$2)', [ids.store, '직접입력']);
  await as(ids.admin, "INSERT INTO purchases(store_id,type) VALUES($1,'수기')", [ids.store]);
  await as(ids.admin, 'SELECT change_purchase_type($1,$2,$3)', [ids.store, '수기', '매장구매']);
  check('이름 변경은 과거 매입에도 반영', (await as(ids.admin, 'SELECT type FROM purchases')).rows[0].type, '매장구매');
  await rejected('구형 폼의 이전 유형 저장 차단', ids.admin, "INSERT INTO purchases(store_id,type) VALUES($1,'수기')", [ids.store]);
  await rejected('직원 유형 변경 차단', ids.a, 'SELECT change_purchase_type($1,NULL,$2)', [ids.store, '임의유형']);
  const month = new Date().toISOString().slice(0, 7);
  const submit = 'SELECT * FROM submit_work_minutes($1,$2,$3,$4,$5)';
  let row = (await as(ids.a, submit, [ids.employee, month, 0, '근무 없음', null])).rows[0];
  check('실제 0분 제출 허용', row.worked_minutes, 0);
  check('제출만으로 급여 생성 안 함', (await as(ids.admin, 'SELECT * FROM payroll')).rows.length, 0);
  await rejected('다른 직원 제출 차단', ids.b, submit, [ids.employee, month, 60, '위조', row.id]);
  await rejected('월 최대 시간 초과 차단', ids.a, submit, [ids.employee, month, 999999, '초과', row.id]);
  await rejected('직원 승인 차단', ids.a, "SELECT review_work_minutes($1,'approved','')", [row.id]);
  await rejected('반려 사유 필수', ids.admin, "SELECT review_work_minutes($1,'rejected','')", [row.id]);
  row = (await as(ids.admin, "SELECT * FROM review_work_minutes($1,'approved','확인')", [row.id])).rows[0];
  check('관리자 확인 완료', row.status, 'approved');
  check('확인만으로 급여 생성 안 함', (await as(ids.admin, 'SELECT * FROM payroll')).rows.length, 0);
  await as(ids.admin, `INSERT INTO payroll(store_id,employee_id,year_month,worked_minutes,work_source,work_note,work_submission_id,gross,net_pay)
    VALUES($1,$2,$3,0,'manual','확인',$4,0,0)`, [ids.store, ids.employee, month, row.id]);
  await as(ids.admin, 'UPDATE payroll SET is_settled=true');
  check('승인 시간 급여 반영 및 정산', (await as(ids.admin, 'SELECT is_settled FROM payroll')).rows[0].is_settled, true);
  const old = row;
  row = (await as(ids.a, submit, [ids.employee, month, 60, '집계 수정', old.id])).rows[0];
  check('재제출 시 정산 확정 해제', (await as(ids.admin, 'SELECT is_settled FROM payroll')).rows[0].is_settled, false);
  check('재제출은 승인 전 금액·시간 유지', (await as(ids.admin, 'SELECT worked_minutes FROM payroll')).rows[0].worked_minutes, 0);
  await rejected('미확인 제출이 있으면 정산 차단', ids.admin, 'UPDATE payroll SET is_settled=true');
  await rejected('예전 제출의 재확인 차단', ids.admin, "SELECT review_work_minutes($1,'approved','확인')", [old.id]);
  await rejected('동시 제출 덮어쓰기 차단', ids.a, submit, [ids.employee, month, 120, '오래된 폼', old.id]);
  check('직원 급여 직접 수정 차단', (await as(ids.a, 'UPDATE payroll SET gross=999 RETURNING id')).rows.length, 0);
  await rejected('계정 연결 탈취 차단', ids.b, 'UPDATE employees SET user_id=$1 WHERE id=$2', [ids.b, ids.employee]);
  await rejected('제출 이력 직접 수정 차단', ids.a, "UPDATE payroll_work_submissions SET status='approved'");
  row = (await as(ids.admin, "SELECT * FROM review_work_minutes($1,'rejected','근무 합계 재확인')", [row.id])).rows[0];
  check('반려 사유 보존', row.review_note, '근무 합계 재확인');
  check('제출 이력 보존', (await as(ids.a, 'SELECT * FROM payroll_work_submissions')).rows.length, 2);
  check('타인 제출 내역 비공개', (await as(ids.b, 'SELECT * FROM payroll_work_submissions')).rows.length, 0);
  await db.query('DELETE FROM auth.users WHERE id=$1', [ids.a]);
  check('회원 탈퇴의 FK 연결 해제 허용', (await db.query('SELECT user_id FROM employees')).rows[0].user_id, null);
  // 사업자번호 신청 → 승인 연결: 기존 직원의 급여 정보·ID 보존과 충돌 복구.
  const c = '00000000-0000-0000-0000-000000000010';
  const d = '00000000-0000-0000-0000-000000000011';
  const e = '00000000-0000-0000-0000-000000000012';
  await db.query('INSERT INTO auth.users(id) SELECT unnest($1::uuid[])', [[c,d,e]]);
  await db.query("UPDATE stores SET business_number='123-45-67890' WHERE id=$1", [ids.store]);
  const preregistered = (await as(ids.admin, "INSERT INTO employees(store_id,name,phone,employment_type,base_salary) VALUES($1,'김직원','010-1234-5678','part_time',1234567) RETURNING id", [ids.store])).rows[0].id;
  const join = 'SELECT * FROM request_store_membership($1,$2,$3)';
  await rejected('신청 연락처 필수', c, join, ['1234567890','김직원','']);
  await rejected('없는 매장 신청 차단', c, join, ['9999999999','김직원','01012345678']);
  check('사업자번호 구분기호 정규화', (await as(c,join,['1234567890',' 김직원 ','01012345678'])).rows[0].store_id, ids.store);
  const member = (await db.query('SELECT id,status,role FROM store_members WHERE user_id=$1',[c])).rows[0];
  check('신청은 승인 대기로 유지', [member.status,member.role], ['pending','member']);
  check('신청만으로 계정 연결 안 함', (await db.query('SELECT user_id FROM employees WHERE id=$1',[preregistered])).rows[0].user_id, null);
  await rejected('중복 신청 차단',c,join,['1234567890','김직원','01012345678']);
  await rejected('직원 자기 승인 차단',c,'SELECT * FROM approve_store_member($1)',[member.id]);
  check('직접 자기 승인도 차단',(await as(c,"UPDATE store_members SET status='approved' WHERE id=$1 RETURNING id",[member.id])).rows.length,0);
  await rejected('관리자 역할 신청 차단',d,"INSERT INTO store_members(store_id,user_id,status,role) VALUES($1,$2,'pending','admin')",[ids.store,d]);
  const approval = (await as(ids.admin,'SELECT * FROM approve_store_member($1)',[member.id])).rows[0];
  check('기존 직원 ID에 연결',approval.employee_id,preregistered);
  const linked = (await db.query('SELECT user_id,base_salary,employment_type FROM employees WHERE id=$1',[preregistered])).rows[0];
  check('기존 급여·고용형태 보존',[linked.user_id,Number(linked.base_salary),linked.employment_type],[c,1234567,'part_time']);
  check('동일 직원 중복 생성 없음',(await db.query("SELECT id FROM employees WHERE name='김직원'")).rows.length,1);
  await rejected('중복 승인 차단',ids.admin,'SELECT * FROM approve_store_member($1)',[member.id]);
  await as(d,join,['1234567890','김직원','01011112222']);
  const conflict = (await db.query('SELECT id FROM store_members WHERE user_id=$1',[d])).rows[0].id;
  await rejected('이름만 일치하는 계정 연결 차단',ids.admin,'SELECT * FROM approve_store_member($1)',[conflict]);
  check('충돌 시 승인도 롤백',(await db.query('SELECT status FROM store_members WHERE id=$1',[conflict])).rows[0].status,'pending');
  await db.query("UPDATE store_members SET applicant_name='이직원' WHERE id=$1",[conflict]);
  await as(ids.admin,'SELECT * FROM approve_store_member($1)',[conflict]);
  check('신규 직원 생성·연결',(await db.query('SELECT name FROM employees WHERE user_id=$1',[d])).rows[0].name,'이직원');
  await as(e,join,['1234567890','김직원','01012345678']);
  const occupied = (await db.query('SELECT id FROM store_members WHERE user_id=$1',[e])).rows[0].id;
  await rejected('다른 계정 연결 직원 탈취 차단',ids.admin,'SELECT * FROM approve_store_member($1)',[occupied]);
  await rejected('멤버 계정 교체 차단',ids.admin,'UPDATE store_members SET user_id=$1 WHERE id=$2',[ids.b,occupied]);
  await as(ids.admin,"DELETE FROM store_members WHERE id=$1",[occupied]);
  await as(e,join,['1234567890','중복직원','01022223333']);
  const duplicateMember = (await db.query('SELECT id FROM store_members WHERE user_id=$1',[e])).rows[0].id;
  await as(ids.admin,"INSERT INTO employees(store_id,name,phone) SELECT $1,'중복직원','01022223333' FROM generate_series(1,2)",[ids.store]);
  await rejected('중복 재직 직원 승인 차단',ids.admin,'SELECT * FROM approve_store_member($1)',[duplicateMember]);
  await db.exec("UPDATE employees SET is_active=false WHERE id=(SELECT id FROM employees WHERE name='중복직원' LIMIT 1)");
  await as(ids.admin,'SELECT * FROM approve_store_member($1)',[duplicateMember]);
  check('중복 정리 후 재직 직원에 연결',(await db.query('SELECT id FROM employees WHERE user_id=$1 AND is_active',[e])).rows.length,1);
  await as(ids.admin,'DELETE FROM store_members WHERE user_id=$1',[e]);
  await as(e,join,['1234567890','중복직원','01022223333']);
  const rejoinMember = (await db.query('SELECT id FROM store_members WHERE user_id=$1',[e])).rows[0].id;
  await as(ids.admin,"UPDATE store_members SET status='approved' WHERE id=$1",[rejoinMember]);
  check('구형 클라이언트 승인·재참여도 기존 연결 보존',(await db.query('SELECT id FROM employees WHERE user_id=$1',[e])).rows.length,1);
  await as(ids.admin,'DELETE FROM store_members WHERE user_id=$1',[e]);
  await db.query('UPDATE employees SET is_active=false WHERE user_id=$1',[e]);
  await as(e,join,['1234567890','중복직원','01022223333']);
  const inactiveMember = (await db.query('SELECT id FROM store_members WHERE user_id=$1',[e])).rows[0].id;
  await rejected('퇴사 직원 재참여 자동 활성화 차단',ids.admin,'SELECT * FROM approve_store_member($1)',[inactiveMember]);
  await db.query("INSERT INTO stores(id,owner_id,business_number) VALUES(gen_random_uuid(),$1,'1234567890')",[ids.admin]);
  await rejected('같은 사업자번호 여러 매장 임의선택 차단',e,join,['1234567890','직원','01022223333']);
  console.log(`PASS local PostgreSQL migrations and ${checks} workflow/security checks`);
} catch (error) { console.error('FAIL local SQL:', error.message); process.exitCode = 1; } finally { await db.close(); }
