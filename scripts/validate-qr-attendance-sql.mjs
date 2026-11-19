// 로컬 PGlite 전용. 실제 Supabase 연결·환경변수·운영 데이터는 사용하지 않는다.
// QR 출퇴근(20261116120000_qr_attendance.sql + 20261116130000_qr_attendance_fixes.sql + 20261117120000_qr_attendance_retry_guard.sql + 20261117130000_qr_attendance_hardening.sql + 20261117140000_qr_attendance_policy.sql) 검증: 토큰·재사용·권한·정정·삭제 대기 매장·파기.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.RATTLE_PGLITE_MODULE ?? '@electric-sql/pglite');
const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({ extensions: { pgcrypto } });
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const u = { owner: id(1), alice: id(2), bob: id(3), other: id(4), outsider: id(5), carol: id(6), dave: id(7) };
const s = { main: id(11), second: id(12) };
const e = { alice: id(21), bob: id(22), aliceSecond: id(23), outsider: id(24), carol: id(25), dave: id(26) };
let checks = 0;
let fixtureTransaction = false;
let expectedErrorSavepoint = false;
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (label, value) => { assert.ok(value, label); checks++; };
async function as(user, sql, params = []) {
  await db.exec(user ? 'SET ROLE authenticated' : 'SET ROLE anon');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
  try { return await db.query(sql, params); }
  catch (error) {
    // PostgreSQL의 명시 트랜잭션은 예상된 오류도 abort된다. 가상 fixture의 오류만 savepoint로 복구한다.
    if (expectedErrorSavepoint) await db.exec('ROLLBACK TO SAVEPOINT expected_attendance_error');
    throw error;
  } finally { await db.exec('RESET ROLE'); }
}
async function rejects(label, code, fn) {
  if (fixtureTransaction) {
    await db.exec('SAVEPOINT expected_attendance_error');
    expectedErrorSavepoint = true;
  }
  try { await assert.rejects(fn, err => String(err.message).includes(code), label); checks++; }
  finally {
    if (expectedErrorSavepoint) {
      await db.exec('RELEASE SAVEPOINT expected_attendance_error');
      expectedErrorSavepoint = false;
    }
  }
}
const migration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const sign = (secret, deviceId, nonce) =>
  createHmac('sha256', Buffer.from(secret, 'base64')).update(`${deviceId}.${nonce}`).digest().subarray(0, 16).toString('hex');
async function qrFor(user, device, secret) {
  const { nonce } = (await as(user, 'SELECT issue_attendance_qr($1) AS r', [device])).rows[0].r;
  return `rattle-punch:v1.${device}.${nonce}.${sign(secret, device, nonce)}`;
}
const punch = (token, qr) => as(null, 'SELECT punch_attendance($1, $2) AS r', [token, qr]).then(r => r.rows[0].r);

try {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
    CREATE TABLE stores(id uuid PRIMARY KEY, owner_id uuid NOT NULL, name text NOT NULL, toss_merchant_id text);
    CREATE TABLE store_members(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, user_id uuid NOT NULL, role text NOT NULL, status text NOT NULL);
    CREATE TABLE store_taxonomies(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE);
    CREATE TABLE employees(id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, user_id uuid, name text NOT NULL, is_active boolean NOT NULL DEFAULT true, employment_type text NOT NULL DEFAULT 'regular' CHECK (employment_type IN ('regular','part_time')));
    CREATE TABLE employee_schedules(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE, day_of_week smallint NOT NULL, is_working boolean NOT NULL DEFAULT false, start_time time, end_time time, UNIQUE(employee_id, day_of_week));
    CREATE TABLE expenses(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE);
    CREATE TABLE payroll_work_submissions(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE);
    CREATE TABLE payroll(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE);
    CREATE TABLE payroll_daily_work(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE);
    CREATE TABLE payroll_daily_work_history(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE);
    CREATE TABLE recurring_fixed_expenses(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT);
    CREATE TABLE recurring_fixed_expense_versions(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, rule_id uuid NOT NULL REFERENCES recurring_fixed_expenses(id) ON DELETE RESTRICT);
    ALTER TABLE stores ENABLE ROW LEVEL SECURITY; ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    CREATE FUNCTION is_store_admin(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT false $$;
    CREATE FUNCTION is_store_member(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT false $$;
    CREATE FUNCTION user_has_store_access(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT false $$;
    CREATE POLICY stores_select ON stores FOR SELECT USING (owner_id = auth.uid() OR is_store_member(id));
    CREATE POLICY employees_admin ON employees FOR ALL USING (is_store_admin(store_id));`);
  // Supabase처럼 새 테이블·함수에 기본 권한이 붙는 상황을 가정(스키마 지정 없는 기본 권한)
  await db.exec(`ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;`);
  await db.exec(await migration('20261028010000_delete_empty_owned_store.sql'));
  await db.exec(await migration('20261114120000_store_soft_delete.sql'));
  // 운영과 같은 정의의 직원 열람 판정 (20261020_01_access_and_purchase_integrity.sql)
  await db.exec(`CREATE FUNCTION public.can_read_employee(p_store_id uuid, p_employee_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT public.is_store_member(p_store_id) AND (public.is_store_admin(p_store_id) OR EXISTS (
        SELECT 1 FROM employees e WHERE e.id=p_employee_id AND e.store_id=p_store_id AND e.user_id=auth.uid() AND e.is_active)) $$;`);
  await db.exec(await migration('20261116120000_qr_attendance.sql'));
  await db.exec(await migration('20261116130000_qr_attendance_fixes.sql'));
  await db.exec(await migration('20261117120000_qr_attendance_retry_guard.sql'));
  const rpcContract = async () => (await db.query(`SELECT p.proname, pg_get_function_arguments(p.oid) args,
      pg_get_function_result(p.oid) result, p.proacl::text acl, p.prosecdef, p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('register_attendance_device','issue_attendance_qr',
      'punch_attendance','attendance_scanner_status','revoke_attendance_devices_on_resign') ORDER BY p.proname`)).rows;
  const contractBefore = await rpcContract();
  const hardening = await migration('20261117130000_qr_attendance_hardening.sql');
  await db.exec(hardening);
  check('보정 후 함수 시그니처/반환/ACL/SECURITY DEFINER/search_path 유지', await rpcContract(), contractBefore);
  await db.exec(hardening);
  check('보정 재실행 안전/계약 유지', await rpcContract(), contractBefore);
  const policyContract = async () => (await db.query(`SELECT p.proname,pg_get_function_arguments(p.oid) args,
    pg_get_function_result(p.oid) result,p.proacl::text acl,p.prosecdef,p.proconfig FROM pg_proc p
    WHERE p.oid IN ('public.request_attendance_correction(uuid,uuid,text,uuid,text,timestamptz,text)'::regprocedure,
      'public.review_attendance_correction(uuid,boolean,text)'::regprocedure,
      'public.record_manual_attendance(uuid,uuid,text,timestamptz,text)'::regprocedure,
      'public.attendance_schedule_flags(uuid,text,timestamptz)'::regprocedure,
      'public.attendance_work_date(uuid,text,timestamptz,uuid)'::regprocedure) ORDER BY p.proname`)).rows;
  const beforePolicy = await policyContract();
  const policy = await migration('20261117140000_qr_attendance_policy.sql');
  await db.exec(policy);
  check('정책 보정 기존 RPC 인자/반환/ACL 유지',await policyContract(),beforePolicy);
  await db.exec(policy);
  check('정책 보정 재실행 안전/계약 유지',await policyContract(),beforePolicy);

  await db.exec(`INSERT INTO auth.users(id) VALUES ('${u.owner}'),('${u.alice}'),('${u.bob}'),('${u.other}'),('${u.outsider}'),('${u.carol}'),('${u.dave}');
    INSERT INTO stores(id, owner_id, name) VALUES ('${s.main}','${u.owner}','본점'),('${s.second}','${u.other}','2호점');
    INSERT INTO store_members(store_id,user_id,role,status) VALUES
      ('${s.main}','${u.alice}','member','approved'),('${s.main}','${u.bob}','member','approved'),('${s.second}','${u.alice}','member','approved'),
      ('${s.main}','${u.carol}','member','approved'),('${s.main}','${u.dave}','member','pending');
    INSERT INTO employees(id, store_id, user_id, name) VALUES
      ('${e.alice}','${s.main}','${u.alice}','김앨리스'),('${e.bob}','${s.main}','${u.bob}','박밥'),
      ('${e.aliceSecond}','${s.second}','${u.alice}','김앨리스'),
      ('${e.carol}','${s.main}','${u.carol}','최캐롤'),('${e.dave}','${s.main}','${u.dave}','정데이브');`);

  // 1. 기기 등록
  await rejects('직원 연결 없는 계정은 기기 등록 불가', 'ATTENDANCE_EMPLOYEE_REQUIRED', () => as(u.outsider, 'SELECT register_attendance_device($1)', ['폰']));
  await rejects('가입 대기 계정은 기기 등록 불가(직원 행이 활성이어도)', 'ATTENDANCE_EMPLOYEE_REQUIRED', () => as(u.dave, 'SELECT register_attendance_device($1)', ['폰']));
  const aliceDev = (await as(u.alice, 'SELECT register_attendance_device($1) AS r', ['앨리스 폰'])).rows[0].r;
  check('최초 등록은 즉시 활성', aliceDev.status, 'active');
  check('비밀키 32바이트', Buffer.from(aliceDev.secret, 'base64').length, 32);
  const bobDev = (await as(u.bob, 'SELECT register_attendance_device($1) AS r', ['밥 폰'])).rows[0].r;
  await rejects('인증 계정은 private 스키마 접근 불가', 'permission denied', () => as(u.alice, 'SELECT * FROM private.attendance_device_secrets'));
  await rejects('비로그인은 기기 표 조회 불가', 'permission denied', () => as(null, 'SELECT * FROM attendance_devices'));
  check('본인 기기만 조회', (await as(u.alice, 'SELECT id FROM attendance_devices')).rows.map(r => r.id), [aliceDev.device_id]);

  // 2. 매장폰 등록
  await rejects('직원은 매장폰 등록 불가', 'ATTENDANCE_ADMIN_REQUIRED', () => as(u.alice, 'SELECT register_attendance_scanner($1,$2)', [s.main, '카운터']));
  const scanner = (await as(u.owner, 'SELECT register_attendance_scanner($1,$2) AS r', [s.main, '카운터'])).rows[0].r;
  const scanner2 = (await as(u.other, 'SELECT register_attendance_scanner($1,$2) AS r', [s.second, '2호점'])).rows[0].r;
  check('매장폰 상태 확인(비로그인)', (await as(null, 'SELECT attendance_scanner_status($1) AS r', [scanner.token])).rows[0].r.store_name, '본점');
  await rejects('관리자도 토큰 해시 열람 불가', 'permission denied', () => as(u.owner, 'SELECT token_hash FROM attendance_scanners'));
  await rejects('틀린 매장폰 토큰', 'ATTENDANCE_SCANNER_INVALID', () => as(null, 'SELECT attendance_scanner_status($1)', ['00']));

  // 3. QR 발급·스캔
  await rejects('남의 기기로 QR 발급 불가', 'ATTENDANCE_DEVICE_INACTIVE', () => as(u.bob, 'SELECT issue_attendance_qr($1)', [aliceDev.device_id]));
  const qr1 = await qrFor(u.alice, aliceDev.device_id, aliceDev.secret);
  const p1 = await punch(scanner.token, qr1);
  check('자동 판단: 첫 기록은 출근', p1.kind, 'clock_in');
  check('이름 일부만 표시', p1.employee_name, '김***');
  ok('스케줄 없음 표시', p1.flags.includes('no_schedule'));
  check('최초 등록 기기는 확인 필요 표시 없음', p1.flags.includes('new_device'), false);
  const again = await punch(scanner.token, qr1);
  check('같은 QR 재제출은 같은 기록(멱등)', [again.duplicate, again.punch_id], [true, p1.punch_id]);
  const qr2 = await qrFor(u.alice, aliceDev.device_id, aliceDev.secret);
  check('60초 안 연속 스캔은 새 기록 없음', (await punch(scanner.token, qr2)).punch_id, p1.punch_id);
  await rejects('쓴 QR은 다른 매장에서 무효', 'ATTENDANCE_QR_INVALID', () => punch(scanner2.token, qr1));
  const forged = (await qrFor(u.alice, aliceDev.device_id, aliceDev.secret)).replace(/.$/, c => (c === '0' ? '1' : '0'));
  await rejects('서명 위조 거절', 'ATTENDANCE_QR_INVALID', () => punch(scanner.token, forged));
  await rejects('형식 오류 거절', 'ATTENDANCE_QR_INVALID', () => punch(scanner.token, 'hello'));
  await rejects('잘못된 UUID 형식도 같은 오류', 'ATTENDANCE_QR_INVALID', () => punch(scanner.token, `rattle-punch:v1.${'-'.repeat(36)}.${'a'.repeat(24)}.${'b'.repeat(32)}`));
  const late = await qrFor(u.alice, aliceDev.device_id, aliceDev.secret);
  await db.query("UPDATE private.attendance_qr_nonces SET expires_at = now() - interval '1 second' WHERE nonce = $1", [late.split('.')[2]]);
  await rejects('만료된 QR 거절', 'ATTENDANCE_QR_EXPIRED', () => punch(scanner.token, late));
  await rejects('서명이 틀린 만료 QR은 만료가 아니라 무효', 'ATTENDANCE_QR_INVALID', () => punch(scanner.token, late.replace(/.$/, c => (c === '0' ? '1' : '0'))));
  await rejects('도우미 함수는 비로그인 실행 불가', 'permission denied', () => as(null, 'SELECT attendance_work_date($1, $2, now())', [e.alice, 'clock_out']));
  await rejects('기본 권한이 있어도 private 접근 불가', 'permission denied', () => as(null, 'SELECT * FROM private.attendance_qr_nonces'));
  // 다른 매장(2호점)에서도 같은 기기로 출근 가능(사람 기준 기기)
  check('여러 매장 근무: 2호점 출근', (await punch(scanner2.token, await qrFor(u.alice, aliceDev.device_id, aliceDev.secret))).kind, 'clock_in');

  // 4. 퇴근 자동 판단·날짜 귀속 (밥: 관리자가 2시간 전 출근 직접 기록 후 스캔)
  await as(u.owner, "SELECT record_manual_attendance($1,$2,'clock_in', now() - interval '2 hours', '폰 배터리 없음')", [s.main, e.bob]);
  await rejects('직접 기록은 사유 필수', 'ATTENDANCE_REASON_REQUIRED', () => as(u.owner, "SELECT record_manual_attendance($1,$2,'clock_in', now(), ' ')", [s.main, e.bob]));
  const bobOut = await punch(scanner.token, await qrFor(u.bob, bobDev.device_id, bobDev.secret));
  check('직접 기록 직후 스캔은 중복으로 막히지 않음', bobOut.duplicate, false);
  check('열린 근무가 있으면 퇴근', bobOut.kind, 'clock_out');
  const bobRows = (await db.query('SELECT kind, work_date FROM attendance_punches WHERE employee_id=$1 ORDER BY punched_at', [e.bob])).rows;
  check('퇴근은 출근일에 귀속', bobRows[1].work_date.getTime(), bobRows[0].work_date.getTime());
  // 야간 근무를 뒤늦게 입력: 어제 22시 출근 기록 후 오늘 02시 퇴근 → 출근일 귀속
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [u.owner]);
  const night = (await db.query(`SELECT public.kst_date(t) d, t FROM (SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') - interval '2 hours') AT TIME ZONE 'Asia/Seoul' AS t) x`)).rows[0];
  await as(u.owner, "SELECT record_manual_attendance($1,$2,'clock_in', $3::timestamptz - interval '20 hours', '야간 근무 수기')", [s.main, e.bob, night.t]);
  await as(u.owner, "SELECT record_manual_attendance($1,$2,'clock_in', $3, '야간 근무 수기')", [s.main, e.bob, night.t]);
  await as(u.owner, "SELECT record_manual_attendance($1,$2,'clock_out', $3::timestamptz + interval '4 hours', '야간 근무 수기')", [s.main, e.bob, night.t]);
  const nightOut = (await db.query("SELECT work_date FROM attendance_punches WHERE employee_id=$1 AND kind='clock_out' AND punched_at=$2::timestamptz + interval '4 hours'", [e.bob, night.t])).rows[0];
  check('자정 넘긴 퇴근은 출근일(어제)에 귀속', nightOut.work_date.getTime(), night.d.getTime());

  // 5. 권한
  check('직원은 본인 기록만 조회', (await as(u.alice, 'SELECT DISTINCT employee_id FROM attendance_punches WHERE store_id=$1', [s.main])).rows.map(r => r.employee_id), [e.alice]);
  check('관리자는 매장 전체 조회', (await as(u.owner, 'SELECT count(DISTINCT employee_id)::int n FROM attendance_punches WHERE store_id=$1', [s.main])).rows[0].n, 2);
  await rejects('직접 INSERT 불가', 'permission denied', () => as(u.owner, "INSERT INTO attendance_punches(store_id, employee_id, kind, punched_at, work_date, source, note) VALUES ($1,$2,'clock_in',now(),current_date,'manual','x')", [s.main, e.alice]));
  await rejects('원본 수정 불가', 'ATTENDANCE_PUNCH_IMMUTABLE', () => db.query("UPDATE attendance_punches SET punched_at = now() - interval '1 day' WHERE id=$1", [p1.punch_id]));
  await rejects('비로그인 기록 조회 불가', 'permission denied', () => as(null, 'SELECT * FROM attendance_punches'));

  // 6. 기기 변경 승인
  const aliceNew = (await as(u.alice, 'SELECT register_attendance_device($1) AS r', ['새 폰'])).rows[0].r;
  check('기기 변경은 승인 대기', aliceNew.status, 'pending');
  await rejects('승인 전 새 기기 QR 불가', 'ATTENDANCE_DEVICE_INACTIVE', () => as(u.alice, 'SELECT issue_attendance_qr($1)', [aliceNew.device_id]));
  await rejects('다른 직원은 승인 불가', 'ATTENDANCE_ADMIN_REQUIRED', () => as(u.bob, 'SELECT approve_attendance_device($1)', [aliceNew.device_id]));
  check('관리자 목록에 대기 기기', (await as(u.owner, "SELECT count(*)::int n FROM list_store_attendance_devices($1) WHERE status='pending'", [s.main])).rows[0].n, 1);
  await as(u.owner, 'SELECT approve_attendance_device($1)', [aliceNew.device_id]);
  const approvedFirst = await punch(scanner2.token, await qrFor(u.alice, aliceNew.device_id, aliceNew.secret));
  check('승인된 새 기기 스캔 성공(60초 안이라 기존 기록 반환)', approvedFirst.duplicate, true);
  check('승인 후 옛 기기 해제', (await db.query('SELECT status FROM attendance_devices WHERE id=$1', [aliceDev.device_id])).rows[0].status, 'revoked');
  await rejects('해제된 기기 QR 불가', 'ATTENDANCE_DEVICE_INACTIVE', () => as(u.alice, 'SELECT issue_attendance_qr($1)', [aliceDev.device_id]));

  // 7. 정정 요청·처리
  await rejects('남의 기록 정정 요청 불가', 'ATTENDANCE_ADMIN_REQUIRED', () => as(u.bob, "SELECT request_attendance_correction($1,$2,'change',$3,NULL,now(),'x')", [s.main, e.alice, p1.punch_id]));
  const reqId = (await as(u.alice, "SELECT request_attendance_correction($1,$2,'change',$3,NULL, now() - interval '30 minutes','버스 지연으로 늦게 찍음') AS r", [s.main, e.alice, p1.punch_id])).rows[0].r;
  await rejects('같은 기록 중복 요청 불가', 'ATTENDANCE_CORRECTION_PENDING', () => as(u.alice, "SELECT request_attendance_correction($1,$2,'void',$3,NULL,NULL,'x')", [s.main, e.alice, p1.punch_id]));
  await rejects('직원은 승인 불가', 'ATTENDANCE_ADMIN_REQUIRED', () => as(u.alice, 'SELECT review_attendance_correction($1, true)', [reqId]));
  const applied = (await as(u.owner, "SELECT review_attendance_correction($1, true, '확인함') AS r", [reqId])).rows[0].r;
  const req = (await db.query('SELECT status, original_snapshot, applied_punch_id FROM attendance_correction_requests WHERE id=$1', [reqId])).rows[0];
  check('요청 승인·적용 기록 연결', [req.status, req.applied_punch_id], ['approved', applied]);
  check('변경 전 스냅샷 보존', req.original_snapshot.punch_id, p1.punch_id);
  const eff = (await as(u.alice, 'SELECT id, source FROM attendance_effective_punches WHERE employee_id=$1', [e.alice])).rows;
  check('유효 기록은 정정본으로 대체', eff.map(r => [r.id, r.source]), [[applied, 'correction']]);
  check('원본은 그대로 남음', (await db.query('SELECT count(*)::int n FROM attendance_punches WHERE id=$1', [p1.punch_id])).rows[0].n, 1);
  const addReq = (await as(u.alice, "SELECT request_attendance_correction($1,$2,'add',NULL,'clock_out', now() - interval '5 minutes','퇴근 스캔 누락') AS r", [s.main, e.alice])).rows[0].r;
  await as(u.owner, 'SELECT review_attendance_correction($1, false, $2)', [addReq, '근무표와 다름']);
  check('반려는 기록을 만들지 않음', (await db.query('SELECT status, applied_punch_id FROM attendance_correction_requests WHERE id=$1', [addReq])).rows[0], { status: 'rejected', applied_punch_id: null });
  const voidReq = (await as(u.owner, "SELECT request_attendance_correction($1,$2,'void',$3,NULL,NULL,'잘못 찍힘') AS r", [s.main, e.bob, bobOut.punch_id])).rows[0].r;
  await as(u.owner, 'SELECT review_attendance_correction($1, true)', [voidReq]);
  const staleReq = (await as(u.owner, "SELECT request_attendance_correction($1,$2,'add',NULL,'clock_in', now() - interval '3 hours','누락') AS r", [s.main, e.bob])).rows[0].r;
  await rejects('추가 요청은 종류·시각 필수', 'ATTENDANCE_INPUT_INVALID', () => as(u.owner, "SELECT request_attendance_correction($1,$2,'add',NULL,NULL,NULL,'x')", [s.main, e.bob]));
  check('추가 요청 생성', typeof staleReq, 'string');
  check('무효 처리 후 유효 기록에서 제외', (await db.query('SELECT count(*)::int n FROM attendance_effective_punches WHERE id=$1', [bobOut.punch_id])).rows[0].n, 0);

  // 7-1. 정정 사유 최대 길이(500자)도 승인 가능
  const longReason = '가'.repeat(500);
  const longReq = (await as(u.alice, "SELECT request_attendance_correction($1,$2,'add',NULL,'clock_out', now() - interval '10 minutes', $3) AS r", [s.main, e.alice, longReason])).rows[0].r;
  const longApplied = (await as(u.owner, 'SELECT review_attendance_correction($1, true) AS r', [longReq])).rows[0].r;
  ok('500자 사유 정정 승인 성공', typeof longApplied === 'string');
  check('요청 사유 원문 보존', (await db.query('SELECT reason FROM attendance_correction_requests WHERE id=$1', [longReq])).rows[0].reason, longReason);
  check('기록 note는 500자로 맞춤', (await db.query('SELECT char_length(note)::int n FROM attendance_punches WHERE id=$1', [longApplied])).rows[0].n, 500);

  // 7-2. 중복 처리한 QR 재시도는 처음 돌려준 기록 유지 + 승인된 새 기기의 첫 기록(독립 사례)
  const carolDev = (await as(u.carol, 'SELECT register_attendance_device($1) AS r', ['캐롤 폰'])).rows[0].r;
  const carolIn = await punch(scanner.token, await qrFor(u.carol, carolDev.device_id, carolDev.secret));
  check('캐롤 첫 스캔은 새 출근', [carolIn.duplicate, carolIn.kind], [false, 'clock_in']);
  const carolDupQr = await qrFor(u.carol, carolDev.device_id, carolDev.secret);
  check('60초 안 다른 QR은 기존 기록 반환', (await punch(scanner.token, carolDupQr)).punch_id, carolIn.punch_id);
  // 60초가 지난 상황을 만들기 위해 검증 전용으로 불변 트리거를 잠시 끄고 출근 시각을 2분 앞당김
  await db.exec('ALTER TABLE attendance_punches DISABLE TRIGGER guard_attendance_punch_immutable');
  await db.query("UPDATE attendance_punches SET punched_at = punched_at - interval '2 minutes' WHERE id=$1", [carolIn.punch_id]);
  await db.exec('ALTER TABLE attendance_punches ENABLE TRIGGER guard_attendance_punch_immutable');
  const dupRetry = await punch(scanner.token, carolDupQr);
  check('60초 뒤 중복 QR 재시도도 처음 반환한 기록', [dupRetry.duplicate, dupRetry.punch_id], [true, carolIn.punch_id]);
  const carolNew = (await as(u.carol, 'SELECT register_attendance_device($1) AS r', ['캐롤 새 폰'])).rows[0].r;
  await as(u.owner, 'SELECT approve_attendance_device($1)', [carolNew.device_id]);
  const carolNewQr = await qrFor(u.carol, carolNew.device_id, carolNew.secret);
  const carolNewFirst = await punch(scanner.token, carolNewQr);
  check('승인된 새 기기 첫 스캔은 새 기록(퇴근)', [carolNewFirst.duplicate, carolNewFirst.kind], [false, 'clock_out']);
  ok('승인된 새 기기 첫 기록은 확인 필요(new_device) 표시', carolNewFirst.flags.includes('new_device'));
  check('새 기록이 실제로 저장됨', (await db.query('SELECT device_id FROM attendance_punches WHERE id=$1', [carolNewFirst.punch_id])).rows[0].device_id, carolNew.device_id);

  // 7-2-1. 처음 반환한 기록이 삭제되면 같은 QR 재시도는 거절(최근 60초의 다른 기록으로 재연결하지 않음)
  await db.query('DELETE FROM attendance_punches WHERE id=$1', [carolIn.punch_id]);
  await rejects('대상 기록 삭제 후 재시도는 거절', 'ATTENDANCE_QR_INVALID', () => punch(scanner.token, carolDupQr));
  check('nonce가 다른 기록으로 덮어써지지 않음', (await db.query('SELECT count(*)::int n FROM private.attendance_qr_nonces WHERE punch_id=$1', [carolNewFirst.punch_id])).rows[0].n, 1);
  check('삭제 후 재시도는 새 기록을 만들지 않음', (await db.query('SELECT count(*)::int n FROM attendance_punches WHERE employee_id=$1', [e.carol])).rows[0].n, 1);

  // 7-2-2. nonce 정리(만료 1시간 후) 이후 재시도는 기록이 남아 있어도 QR_INVALID
  await db.query("UPDATE private.attendance_qr_nonces SET expires_at = now() - interval '2 hours' WHERE punch_id=$1", [carolNewFirst.punch_id]);
  await qrFor(u.carol, carolNew.device_id, carolNew.secret); // QR 발급 시 오래된 nonce 정리
  await rejects('정리된 nonce 재시도는 QR_INVALID', 'ATTENDANCE_QR_INVALID', () => punch(scanner.token, carolNewQr));
  check('정리 후에도 기록은 남음', (await db.query('SELECT count(*)::int n FROM attendance_punches WHERE id=$1', [carolNewFirst.punch_id])).rows[0].n, 1);

  // 7-3. 멤버십이 대기·거절로 바뀌면 스캔·본인 정정 요청 차단
  for (const status of ['pending', 'rejected']) {
    const beforeStatusChange = await qrFor(u.carol, carolNew.device_id, carolNew.secret);
    await db.query('UPDATE store_members SET status=$1 WHERE store_id=$2 AND user_id=$3', [status, s.main, u.carol]);
    await rejects(`멤버십 ${status}: QR 발급 거절`, 'ATTENDANCE_EMPLOYEE_REQUIRED', () => as(u.carol, 'SELECT issue_attendance_qr($1)', [carolNew.device_id]));
    await rejects(`멤버십 ${status}: 스캔 거절`, 'ATTENDANCE_NOT_EMPLOYEE', () => punch(scanner.token, beforeStatusChange));
    await rejects(`멤버십 ${status}: 본인 정정 요청 거절`, 'ATTENDANCE_NOT_EMPLOYEE', () => as(u.carol, "SELECT request_attendance_correction($1,$2,'add',NULL,'clock_in', now() - interval '1 hour','누락')", [s.main, e.carol]));
    await db.query("UPDATE store_members SET status='approved' WHERE store_id=$1 AND user_id=$2", [s.main, u.carol]);
  }
  await db.query("UPDATE store_members SET status='approved' WHERE store_id=$1 AND user_id=$2", [s.main, u.carol]);
  ok('승인 복귀 후 정정 요청 가능', typeof (await as(u.carol, "SELECT request_attendance_correction($1,$2,'add',NULL,'clock_in', now() - interval '1 hour','누락') AS r", [s.main, e.carol])).rows[0].r === 'string');

  // 8. 퇴사 시 기기 자동 해제(다른 매장 근무가 없을 때만)
  await db.query('UPDATE employees SET is_active=false WHERE id=$1', [e.bob]);
  check('퇴사 → 기기 해제', (await db.query('SELECT status FROM attendance_devices WHERE id=$1', [bobDev.device_id])).rows[0].status, 'revoked');
  await db.query('UPDATE employees SET is_active=false WHERE id=$1', [e.alice]);
  check('다른 매장 근무 중이면 유지', (await db.query("SELECT count(*)::int n FROM attendance_devices WHERE user_id=$1 AND status='active'", [u.alice])).rows[0].n, 1);
  await rejects('퇴사한 매장에서는 스캔 거절', 'ATTENDANCE_NOT_EMPLOYEE', async () => punch(scanner.token, await qrFor(u.alice, aliceNew.device_id, aliceNew.secret)));

  // 9. 매장폰 해제
  await as(u.owner, 'SELECT revoke_attendance_scanner($1)', [scanner.scanner_id]);
  await rejects('해제된 매장폰 즉시 거절', 'ATTENDANCE_SCANNER_INVALID', () => punch(scanner.token, qr1));

  // 10. 삭제 대기 매장·파기
  const missing = (await db.query(`SELECT t.relname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    WHERE c.contype='f' AND c.confrelid='public.stores'::regclass
      AND (NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename=t.relname AND p.permissive='RESTRICTIVE' AND p.policyname LIKE 'deleted_store_guard_%')
        OR NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid=t.oid AND g.tgname LIKE 'guard_deleted_store_%'))`)).rows;
  check('출퇴근 테이블 포함 모든 매장 참조 테이블에 가드', missing, []);
  await as(u.other, 'SELECT delete_owned_store($1)', [s.second]);
  await rejects('삭제 대기 매장 매장폰 거절', 'ATTENDANCE_SCANNER_INVALID', () => as(null, 'SELECT attendance_scanner_status($1)', [scanner2.token]));
  await db.exec(`BEGIN; SELECT set_config('rattle.store_purge','on',true);
    UPDATE stores SET deleted_at = now() - interval '8 days', purge_after = now() - interval '1 day' WHERE id='${s.second}'; COMMIT;`);
  await db.exec('SET ROLE service_role');
  const purged = (await db.query('SELECT purge_expired_deleted_stores() AS n')).rows[0].n;
  await db.exec('RESET ROLE');
  check('출퇴근 기록이 있는 매장도 파기 성공', purged, 1);
  check('파기 실패 없음', (await db.query('SELECT count(*)::int n FROM store_purge_failures')).rows[0].n, 0);
  check('2호점 출퇴근 기록 파기', (await db.query('SELECT count(*)::int n FROM attendance_punches WHERE store_id=$1', [s.second])).rows[0].n, 0);


  // 11. 보안 보정 회귀. QA-QR-HARDENING-20261117: 메모리 DB/가상 계정만, 이 프로세스 소유.
  // 기존 사례 이후 별도 매장/직원 fixture를 사용한다. 실제 직원/원격/현재 달 급여는 사용하지 않는다.
  const qa = { user: id(101), other: id(102), store: id(111), employee: id(121), second: id(122) };
  await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [qa.user, qa.other]);
  await db.query("INSERT INTO stores(id,owner_id,name) VALUES ($1,$2,'QA-QR-HARDENING')", [qa.store, u.owner]);
  await db.query(`INSERT INTO store_members(store_id,user_id,role,status) VALUES
    ($1,$2,'member','approved'),($3,$2,'member','approved'),($1,$4,'member','approved')`, [qa.store, qa.user, s.main, qa.other]);
  await db.query(`INSERT INTO employees(id,store_id,user_id,name) VALUES
    ($1,$2,$3,'QA-가상직원'),($4,$5,$3,'QA-가상겸직')`, [qa.employee, qa.store, qa.user, qa.second, s.main]);
  const qaScanner = (await as(u.owner, 'SELECT register_attendance_scanner($1,$2) AS r', [qa.store, 'QA-스캐너'])).rows[0].r;
  const qaDev = (await as(qa.user, 'SELECT register_attendance_device($1) AS r', ['QA-기존폰'])).rows[0].r;
  const qaPending = (await as(qa.user, 'SELECT register_attendance_device($1) AS r', ['QA-대기폰'])).rows[0].r;
  const oldQr = await qrFor(qa.user, qaDev.device_id, qaDev.secret);
  await as(u.owner, 'DELETE FROM employees WHERE id=$1', [qa.second]);
  check('직원 DELETE: 다른 활성 매장 있으면 활성/대기 모두 유지',
    (await db.query('SELECT status FROM attendance_devices WHERE id IN ($1,$2) ORDER BY status', [qaDev.device_id, qaPending.device_id])).rows.map(r => r.status), ['active','pending']);
  await as(u.owner, 'DELETE FROM employees WHERE id=$1', [qa.employee]);
  check('직원 DELETE: 마지막 재직 관계면 활성/대기 모두 해제',
    (await db.query('SELECT status FROM attendance_devices WHERE id IN ($1,$2)', [qaDev.device_id, qaPending.device_id])).rows.map(r => r.status), ['revoked','revoked']);
  await db.query("INSERT INTO employees(id,store_id,user_id,name) VALUES ($1,$2,$3,'QA-재연결')", [qa.employee, qa.store, qa.user]);
  await rejects('DELETE 후 같은 계정 재연결: 옛 secret QR 스캔 차단', 'ATTENDANCE_DEVICE_INACTIVE', () => punch(qaScanner.token, oldQr));
  await rejects('DELETE 후 재연결: 옛 기기 발급도 차단', 'ATTENDANCE_DEVICE_INACTIVE', () => as(qa.user, 'SELECT issue_attendance_qr($1)', [qaDev.device_id]));
  const qaRejoin = (await as(qa.user, 'SELECT register_attendance_device($1) AS r', ['QA-재등록'])).rows[0].r;
  check('DELETE 후 재등록도 최초 등록으로 취급하지 않음', qaRejoin.status, 'pending');
  await rejects('DELETE 후 재등록 승인 전 발급 차단', 'ATTENDANCE_DEVICE_INACTIVE', () => as(qa.user, 'SELECT issue_attendance_qr($1)', [qaRejoin.device_id]));
  await as(u.owner, 'SELECT approve_attendance_device($1)', [qaRejoin.device_id]);
  check('DELETE 후 관리자 승인된 새 기기 스캔 가능', (await punch(qaScanner.token, await qrFor(qa.user, qaRejoin.device_id, qaRejoin.secret))).kind, 'clock_in');
  await rejects('새 기기 승인해도 옛 secret은 차단', 'ATTENDANCE_DEVICE_INACTIVE', () => punch(qaScanner.token, oldQr));

  // 같은 fixture를 트랜잭션 롤백하며 user_id 변경 분기를 독립 검사한다.
  await db.exec('BEGIN'); fixtureTransaction = true;
  try {
    await db.query("INSERT INTO employees(id,store_id,user_id,name) VALUES ($1,$2,$3,'QA-겸직복원')", [qa.second, s.main, qa.user]);
    await as(u.owner, 'UPDATE employees SET user_id=NULL WHERE id=$1', [qa.employee]);
    check('user_id NULL: 다른 활성 매장 있으면 유지', (await db.query('SELECT status FROM attendance_devices WHERE id=$1', [qaRejoin.device_id])).rows[0].status, 'active');
    await as(u.owner, 'UPDATE employees SET user_id=$1 WHERE id=$2', [qa.other, qa.second]);
    check('user_id 다른 계정: OLD 계정 마지막 관계면 해제', (await db.query('SELECT status FROM attendance_devices WHERE id=$1', [qaRejoin.device_id])).rows[0].status, 'revoked');
    await as(u.owner, 'UPDATE employees SET user_id=$1 WHERE id=$2', [qa.user, qa.employee]);
    await rejects('user_id 재연결도 옛 기기 발급 차단', 'ATTENDANCE_DEVICE_INACTIVE', () => as(qa.user, 'SELECT issue_attendance_qr($1)', [qaRejoin.device_id]));
  } finally { expectedErrorSavepoint = false; fixtureTransaction = false; await db.exec('ROLLBACK'); }
  await db.exec('BEGIN'); fixtureTransaction = true;
  try {
    const unconsumedQr = await qrFor(qa.user, qaRejoin.device_id, qaRejoin.secret);
    await as(u.owner, 'UPDATE employees SET is_active=false,user_id=NULL WHERE id=$1', [qa.employee]);
    check('퇴사+user_id 동시 변경도 OLD 계정 기기 해제', (await db.query('SELECT status FROM attendance_devices WHERE id=$1', [qaRejoin.device_id])).rows[0].status, 'revoked');
    await as(u.owner, 'UPDATE employees SET is_active=true,user_id=$1 WHERE id=$2', [qa.user, qa.employee]);
    await rejects('동시 변경 후 재연결해도 미사용 옛 QR 차단', 'ATTENDANCE_DEVICE_INACTIVE', () => punch(qaScanner.token, unconsumedQr));
  } finally { expectedErrorSavepoint = false; fixtureTransaction = false; await db.exec('ROLLBACK'); }

  // 발급 시에도 재직/승인 관계 재검사(기기 상태를 변경하지 않은 멤버십 철회 포함).
  for (const status of ['pending','rejected','missing']) {
    await db.exec('BEGIN'); fixtureTransaction = true;
    try {
      if (status === 'missing') await db.query('DELETE FROM store_members WHERE store_id=$1 AND user_id=$2', [qa.store, qa.user]);
      else await db.query('UPDATE store_members SET status=$1 WHERE store_id=$2 AND user_id=$3', [status, qa.store, qa.user]);
      await rejects(`발급 재직 확인: 멤버십 ${status}`, 'ATTENDANCE_EMPLOYEE_REQUIRED', () => as(qa.user, 'SELECT issue_attendance_qr($1)', [qaRejoin.device_id]));
      check(`멤버십 ${status} 발급 거절 후 nonce 증가 없음`, (await db.query('SELECT count(*)::int n FROM private.attendance_qr_nonces WHERE device_id=$1 AND used_at IS NULL', [qaRejoin.device_id])).rows[0].n, 0);
    } finally { expectedErrorSavepoint = false; fixtureTransaction = false; await db.exec('ROLLBACK'); }
  }
  await db.exec('BEGIN'); fixtureTransaction = true;
  try {
    await db.query('UPDATE stores SET owner_id=$1 WHERE id=$2', [qa.user, qa.store]);
    await db.query('DELETE FROM store_members WHERE store_id=$1 AND user_id=$2', [qa.store, qa.user]);
    ok('매장 소유자도 활성 직원 연결이 있으면 발급', (await as(qa.user, 'SELECT issue_attendance_qr($1) AS r', [qaRejoin.device_id])).rows[0].r.nonce);
    // 트리거를 끈 가상 비정상 상태에서도 발급 자체가 직원 없음/비활성을 검사한다.
    await db.exec('ALTER TABLE employees DISABLE TRIGGER revoke_attendance_devices_on_resign');
    await db.query('UPDATE employees SET is_active=false WHERE id=$1', [qa.employee]);
    await rejects('활성 기기라도 비활성 직원뿐이면 발급 차단', 'ATTENDANCE_EMPLOYEE_REQUIRED', () => as(qa.user, 'SELECT issue_attendance_qr($1)', [qaRejoin.device_id]));
    await db.query('DELETE FROM employees WHERE id=$1', [qa.employee]);
    await rejects('활성 기기라도 직원 행 없으면 발급 차단', 'ATTENDANCE_EMPLOYEE_REQUIRED', () => as(qa.user, 'SELECT issue_attendance_qr($1)', [qaRejoin.device_id]));
  } finally { expectedErrorSavepoint = false; fixtureTransaction = false; await db.exec('ROLLBACK'); }
  await rejects('비로그인 QR 발급 RPC 불가', 'permission denied', () => as(null, 'SELECT issue_attendance_qr($1)', [qaRejoin.device_id]));

  // 5개 경계/소모/만료 후 여유, 다른 기기 정리 금지, 1시간 재시도 보존.
  await db.exec('BEGIN'); fixtureTransaction = true;
  try {
    await db.query('DELETE FROM private.attendance_qr_nonces WHERE device_id=$1', [qaRejoin.device_id]);
    const issued = [];
    for (let i=0; i<5; i++) issued.push((await as(qa.user, 'SELECT issue_attendance_qr($1) AS r', [qaRejoin.device_id])).rows[0].r);
    check('미사용 nonce 5개까지 발급', (await db.query('SELECT count(*)::int n FROM private.attendance_qr_nonces WHERE device_id=$1 AND used_at IS NULL', [qaRejoin.device_id])).rows[0].n, 5);
    await rejects('6번째 미사용 nonce 발급 차단', 'ATTENDANCE_QR_RATE_LIMIT', () => as(qa.user, 'SELECT issue_attendance_qr($1)', [qaRejoin.device_id]));
    check('거절 후에도 미사용 5개', (await db.query('SELECT count(*)::int n FROM private.attendance_qr_nonces WHERE device_id=$1 AND used_at IS NULL', [qaRejoin.device_id])).rows[0].n, 5);
    ok('nonce는 소문자 hex 24자', /^[0-9a-f]{24}$/.test(issued[0].nonce));
    check('발급 TTL 45초', (await db.query('SELECT extract(epoch FROM expires_at-issued_at)::int n FROM private.attendance_qr_nonces WHERE nonce=$1', [issued[0].nonce])).rows[0].n, 45);
    const consumedQr = `rattle-punch:v1.${qaRejoin.device_id}.${issued[0].nonce}.${sign(qaRejoin.secret,qaRejoin.device_id,issued[0].nonce)}`;
    const consumed = await punch(qaScanner.token, consumedQr);
    ok('QR 소비하면 한 개 추가 발급 가능', (await as(qa.user, 'SELECT issue_attendance_qr($1) AS r', [qaRejoin.device_id])).rows[0].r.nonce);
    await db.query("UPDATE private.attendance_qr_nonces SET expires_at=clock_timestamp()-interval '1 second' WHERE nonce=$1", [issued[1].nonce]);
    ok('미사용 QR 만료 후 추가 발급 가능', (await as(qa.user, 'SELECT issue_attendance_qr($1) AS r', [qaRejoin.device_id])).rows[0].r.nonce);
    // 빈 슬롯을 만들고, 만료 59분 전의 처리된 QR과 타 기기 오래된 nonce를 심는다.
    await db.query("UPDATE private.attendance_qr_nonces SET expires_at=clock_timestamp()-interval '59 minutes' WHERE nonce=$1", [issued[0].nonce]);
    await db.query("UPDATE private.attendance_qr_nonces SET expires_at=clock_timestamp()-interval '2 hours' WHERE nonce=$1", [issued[2].nonce]);
    const foreignNonce = 'f'.repeat(24);
    await db.query("INSERT INTO private.attendance_qr_nonces(nonce,device_id,expires_at) VALUES ($1,$2,clock_timestamp()-interval '2 hours')", [foreignNonce,qaDev.device_id]);
    await as(qa.user, 'SELECT issue_attendance_qr($1)', [qaRejoin.device_id]);
    check('호출 기기 만료 1시간 초과 nonce만 정리', (await db.query('SELECT count(*)::int n FROM private.attendance_qr_nonces WHERE nonce=$1', [issued[2].nonce])).rows[0].n, 0);
    check('타 기기 오래된 nonce는 발급자가 정리하지 않음', (await db.query('SELECT count(*)::int n FROM private.attendance_qr_nonces WHERE nonce=$1', [foreignNonce])).rows[0].n, 1);
    check('만료 후 1시간 안 처리된 QR 재시도 유지', (await punch(qaScanner.token, consumedQr)).punch_id, consumed.punch_id);
  } finally { expectedErrorSavepoint = false; fixtureTransaction = false; await db.exec('ROLLBACK'); }

  // anon 입력 조기 차단. null/빈값/초과 길이/대문자/비hex/줄바꿈/다중바이트 모두 기존 오류 코드.
  for (const [label, token] of [
    ['null',null],['empty',''],['short','a'.repeat(63)],['long','a'.repeat(65)],['large','a'.repeat(100000)],
    ['uppercase','A'.repeat(64)],['nonhex','g'.repeat(64)],['newline','a'.repeat(63)+'\n'],['unicode','가'.repeat(64)]
  ]) {
    await rejects(`scanner_status ${label} 토큰 거절`, 'ATTENDANCE_SCANNER_INVALID', () => as(null, 'SELECT attendance_scanner_status($1)', [token]));
    await rejects(`punch ${label} 토큰 거절`, 'ATTENDANCE_SCANNER_INVALID', () => punch(token, oldQr));
  }
  const syntacticQr = `rattle-punch:v1.${qaRejoin.device_id}.${'a'.repeat(24)}.${'b'.repeat(32)}`;
  for (const [label, qr] of [
    ['null',null],['empty',''],['short',syntacticQr.slice(1)],['long',syntacticQr+'a'],['large','a'.repeat(100000)],
    ['uppercase',syntacticQr.toUpperCase()],['nonhex',syntacticQr.slice(0,-1)+'g'],['newline',syntacticQr.slice(0,-1)+'\n'],
    ['unicode','가'.repeat(110)]
  ]) await rejects(`punch ${label} QR 거절`, 'ATTENDANCE_QR_INVALID', () => punch(qaScanner.token,qr));
  check('불량 입력 후 새 출퇴근 없음', (await db.query('SELECT count(*)::int n FROM attendance_punches WHERE employee_id=$1', [qa.employee])).rows[0].n, 1);
  await rejects('형식 정상이나 미등록 토큰 거절', 'ATTENDANCE_SCANNER_INVALID', () => punch('0'.repeat(64), syntacticQr));
  // 문자열 소스 검사만으로 실제 병렬 실행 증명을 대신하지 않는다. 잠금/조기 거절 순서의 회귀 가드다.
  const source = async name => (await db.query('SELECT prosrc FROM pg_proc WHERE oid=$1::regprocedure', [name])).rows[0].prosrc;
  const issueSource = await source('public.issue_attendance_qr(uuid)');
  ok('발급 기기 잠금이 count/insert보다 먼저', issueSource.indexOf("'attendance_qr:'") < issueSource.indexOf('SELECT count(*)') && issueSource.indexOf('SELECT count(*)') < issueSource.indexOf('INSERT INTO private.attendance_qr_nonces'));
  const punchSource = await source('public.punch_attendance(text,text)');
  ok('punch 길이/형식 검사는 첫 해시/조회보다 먼저', punchSource.indexOf('octet_length(p_scanner_token)') < punchSource.indexOf('regexp_match') && punchSource.indexOf('IF parts IS NULL') < punchSource.indexOf('SELECT * INTO s'));
  const statusSource = await source('public.attendance_scanner_status(text)');
  ok('scanner_status 길이/형식 검사는 첫 해시/조회보다 먼저', statusSource.indexOf('octet_length(p_scanner_token)') < statusSource.indexOf('SELECT * INTO s') && statusSource.indexOf("!~ '^[0-9a-f]{64}$'") < statusSource.indexOf('SELECT * INTO s'));


  // 12. QA-QR-POLICY-20261117: 역할/정정 순서/원자적 짝 날짜/야간 스케줄.
  const pol = { owner:id(201), manager:id(202), part:id(203), regular:id(204), adminPart:id(205), store:id(211) };
  await db.query('INSERT INTO auth.users(id) VALUES ($1),($2),($3),($4),($5)', [pol.owner,pol.manager,pol.part,pol.regular,pol.adminPart]);
  await db.query("INSERT INTO stores(id,owner_id,name) VALUES ($1,$2,'QA-QR-POLICY')", [pol.store,pol.owner]);
  for (const [who,role] of [[pol.manager,'admin'],[pol.part,'member'],[pol.regular,'member'],[pol.adminPart,'admin']]) {
    await db.query("INSERT INTO store_members(store_id,user_id,role,status) VALUES ($1,$2,$3,'approved')", [pol.store,who,role]);
  }
  const pe = { owner:id(221),manager:id(222),part:id(223),regular:id(224),adminPart:id(225) };
  for (const [key,user] of Object.entries(pol).filter(([k])=>k!=='store')) {
    await db.query('INSERT INTO employees(id,store_id,user_id,name,employment_type) VALUES ($1,$2,$3,$4,$5)',
      [pe[key],pol.store,user,`QA-${key}`,['part','adminPart'].includes(key)?'part_time':'regular']);
  }
  // Final role model: raw legacy admin is not an appointed manager.
  await db.exec(`ALTER TABLE payroll ADD COLUMN worked_minutes integer,ADD COLUMN work_submission_id uuid,ADD COLUMN daily_work_snapshot jsonb;
    CREATE TABLE attendance(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid REFERENCES stores(id),employee_id uuid REFERENCES employees(id));
    CREATE TABLE schedule_requests(id uuid PRIMARY KEY,store_id uuid,employee_id uuid,status text,reviewed_by uuid,reviewed_at timestamptz);
    CREATE TABLE attendance_corrections(id uuid PRIMARY KEY,store_id uuid,employee_id uuid,status text,reviewed_by uuid,reviewed_at timestamptz);
    CREATE FUNCTION is_store_part_timer(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM employees WHERE store_id=sid AND user_id=auth.uid() AND employment_type='part_time') $$;`);
  await db.exec(await migration('20261117150000_role_model_core.sql'));
  await db.exec(await migration('20261117170000_manager_rpc_policy.sql'));
  const managerMember=(await db.query('SELECT id FROM store_members WHERE store_id=$1 AND user_id=$2',[pol.store,pol.manager])).rows[0].id;
  await as(pol.owner,'SELECT set_store_manager($1,$2,0)',[pol.store,managerMember]);
  await db.exec(await migration('20261117180000_legacy_admin_to_member.sql'));
  const anchor = (await db.query("SELECT ((public.kst_date(now())-7)::timestamp AT TIME ZONE 'Asia/Seoul') AS t")).rows[0].t;
  const at = minutes => new Date(anchor.getTime()+minutes*60000).toISOString();
  const request = (employee,action,target,kind,time,who=pol.owner) => as(who,
    'SELECT request_attendance_correction($1,$2,$3,$4,$5,$6,$7) AS r', [pol.store,employee,action,target,kind,time,'QA-정정']).then(r=>r.rows[0].r);
  const review = (rid,approve,who=pol.owner) => as(who,'SELECT review_attendance_correction($1,$2) AS r',[rid,approve]).then(r=>r.rows[0].r);
  const manual = (employee,kind,time,who=pol.owner) => as(who,'SELECT record_manual_attendance($1,$2,$3,$4,$5) AS r',
    [pol.store,employee,kind,time,'QA-직접기록']).then(r=>r.rows[0].r);
  const reqState = rid => db.query('SELECT status,applied_punch_id,paired_applied_punch_id,original_snapshot FROM attendance_correction_requests WHERE id=$1',[rid]).then(r=>r.rows[0]);
  let roleMinute=0;
  const addRequest = employee => request(employee,'add',null,'clock_in',at(roleMinute++));
  ok('소유자 본인 정정 자기 승인 허용', await review(await addRequest(pe.owner),true));
  check('소유자 본인 정정 자기 반려 허용', await review(await addRequest(pe.owner),false), null);
  ok('직원 관리자: 파트타이머 정정 승인 허용', await review(await addRequest(pe.part),true,pol.manager));
  check('직원 관리자: 파트타이머 정정 반려 허용', await review(await addRequest(pe.part),false,pol.manager),null);
  for (const [label,employee,who,code] of [
    ['관리자 본인',pe.manager,pol.manager,'ATTENDANCE_OWNER_REQUIRED'],
    ['일반 파트타이머 처리자',pe.part,pol.part,'ATTENDANCE_ADMIN_REQUIRED'],
    ['미지정 legacy admin 처리자',pe.part,pol.adminPart,'ATTENDANCE_ADMIN_REQUIRED'],
    ['타 매장 소유자',pe.part,u.owner,'ATTENDANCE_ADMIN_REQUIRED']
  ]) {
    const rid=await addRequest(employee);
    for (const approve of [true,false]) await rejects(`${label}: 승인/반려 ${approve} 거절`,code,()=>review(rid,approve,who));
    check(`${label}: 거절 후 요청 대기 유지`,(await reqState(rid)).status,'pending');
    await review(rid,false);
  }
  await db.query("UPDATE store_members SET status='pending' WHERE store_id=$1 AND user_id=$2",[pol.store,pol.manager]);
  const unapprovedReq=await addRequest(pe.part);
  await rejects('미승인 admin은 승인 불가','ATTENDANCE_ADMIN_REQUIRED',()=>review(unapprovedReq,true,pol.manager));
  await review(unapprovedReq,false);
  await db.query("UPDATE store_members SET status='approved' WHERE store_id=$1 AND user_id=$2",[pol.store,pol.manager]);
  await as(pol.owner,'SELECT set_store_manager($1,$2,2)',[pol.store,managerMember]);
  ok('점장은 정규직 정정 승인 가능',await review(await addRequest(pe.regular),true,pol.manager));
  check('점장은 사장 정정 반려 가능',await review(await addRequest(pe.owner),false,pol.manager),null);
  ok('소유자는 정규직 정정 승인 가능',await review(await addRequest(pe.regular),true));
  ok('소유자는 관리자 정정 승인 가능',await review(await addRequest(pe.manager),true));
  ok('직접 기록도 관리자→파트타이머 허용',await manual(pe.part,'clock_out',at(60),pol.manager));
  for (const [label,employee,who,code] of [
    ['본인',pe.manager,pol.manager,'ATTENDANCE_OWNER_REQUIRED'],
    ['미지정 legacy admin',pe.part,pol.adminPart,'ATTENDANCE_ADMIN_REQUIRED'],['파트타이머',pe.part,pol.part,'ATTENDANCE_ADMIN_REQUIRED']
  ]) await rejects(`직접 기록도 ${label} 범위 거절`,code,()=>manual(employee,'clock_in',at(120),who));
  ok('소유자 직접 본인 기록 허용',await manual(pe.owner,'clock_out',at(60)));

  let employeeSeq=230;
  const fixtureEmployee = async () => {
    const eid=id(employeeSeq++);
    await db.query("INSERT INTO employees(id,store_id,name,employment_type) VALUES ($1,$2,'QA-순서','regular')",[eid,pol.store]);
    return eid;
  };
  const ordered=await fixtureEmployee();
  const orderedIn=await manual(ordered,'clock_in',at(540));
  const orderedOut=await manual(ordered,'clock_out',at(1020));
  await rejects('요청 시 출근>짝 퇴근 거절','ATTENDANCE_ORDER_INVALID',()=>request(ordered,'change',orderedIn,null,at(1080)));
  await rejects('요청 시 퇴근<짝 출근 거절','ATTENDANCE_ORDER_INVALID',()=>request(ordered,'change',orderedOut,null,at(480)));
  const equalReq=await request(ordered,'change',orderedIn,null,at(1020));
  const equalApplied=await review(equalReq,true);
  ok('출근=퇴근 같은 시각 허용',equalApplied);
  ok('동시각 정정 후 다시 앞 시각으로 고칠 수 있음',await review(await request(ordered,'change',equalApplied,null,at(960)),true));

  const approvalOrder=await fixtureEmployee();
  const apIn=await manual(approvalOrder,'clock_in',at(540));
  const apOut=await manual(approvalOrder,'clock_out',at(1020));
  const apInReq=await request(approvalOrder,'change',apIn,null,at(960));
  const apOutReq=await request(approvalOrder,'change',apOut,null,at(900));
  await review(apOutReq,true);
  await rejects('승인 시 짝 퇴근 변경 후 출근 역전 재검사','ATTENDANCE_ORDER_INVALID',()=>review(apInReq,true));
  check('순서 거절은 대기 유지/새 원본 미생성',(await reqState(apInReq)).status,'pending');
  check('순서 거절은 출근 원본 유지',(await db.query('SELECT id FROM attendance_effective_punches WHERE employee_id=$1 AND kind=$2',[approvalOrder,'clock_in'])).rows[0].id,apIn);
  await review(apInReq,false);
  const approvalReverse=await fixtureEmployee();
  const reverseIn=await manual(approvalReverse,'clock_in',at(540));
  const reverseOut=await manual(approvalReverse,'clock_out',at(1020));
  const reverseReq=await request(approvalReverse,'change',reverseOut,null,at(600));
  await review(await request(approvalReverse,'change',reverseIn,null,at(660)),true);
  await rejects('승인 시 짝 출근 변경 후 퇴근 역전 재검사','ATTENDANCE_ORDER_INVALID',()=>review(reverseReq,true));
  await review(reverseReq,false);

  const multi=await fixtureEmployee();
  const mIn1=await manual(multi,'clock_in',at(540));
  const mOut1=await manual(multi,'clock_out',at(720));
  const mIn2=await manual(multi,'clock_in',at(840));
  await manual(multi,'clock_out',at(1080));
  await rejects('다중 근무: 첫 퇴근이 다음 출근 넘어가지 못함','ATTENDANCE_ORDER_INVALID',()=>request(multi,'change',mOut1,null,at(900)));
  await rejects('다중 근무: 두 번째 출근이 앞 퇴근 넘어가지 못함','ATTENDANCE_ORDER_INVALID',()=>request(multi,'change',mIn2,null,at(660)));
  check('다중 근무: 첫 출근은 바로 이웃한 첫 퇴근과 짝',(await db.query('SELECT (attendance_shift_partner($1)).id AS id',[mIn1])).rows[0].id,mOut1);

  const midnight=await fixtureEmployee();
  const midIn=await manual(midnight,'clock_in',at(60));
  const midOut=await manual(midnight,'clock_out',at(180));
  const laterIn=await manual(midnight,'clock_in',at(480));
  const laterOut=await manual(midnight,'clock_out',at(600));
  const originalMid=(await db.query('SELECT * FROM attendance_punches WHERE id IN ($1,$2) ORDER BY id',[midIn,midOut])).rows;
  const pendingOut=await request(midnight,'change',midOut,null,at(181));
  const midnightReq=await request(midnight,'change',midIn,null,at(-60));
  const midnightApplied=await review(midnightReq,true);
  const midnightState=await reqState(midnightReq);
  ok('날짜 변경 승인에 시스템 짝 퇴근 연결',midnightState.paired_applied_punch_id);
  const pairedRow=(await db.query('SELECT * FROM attendance_punches WHERE id=$1',[midnightState.paired_applied_punch_id])).rows[0];
  check('짝 퇴근은 시각 보존/원본 supersedes/source 연결',[pairedRow.supersedes_id,pairedRow.punched_at.toISOString(),pairedRow.source],[midOut,at(180),'correction']);
  const correctedDate=(await db.query('SELECT work_date FROM attendance_punches WHERE id=$1',[midnightApplied])).rows[0].work_date;
  check('짝 퇴근 work_date가 출근 정정의 날짜를 따름',pairedRow.work_date.getTime(),correctedDate.getTime());
  check('정정 전 출근/퇴근 원본 바이트값 보존',(await db.query('SELECT * FROM attendance_punches WHERE id IN ($1,$2) ORDER BY id',[midIn,midOut])).rows,originalMid);
  check('요청 스냅샷에 신청/승인 시점 짝 원본 유지',[midnightState.original_snapshot.paired_original.punch_id,midnightState.original_snapshot.paired_before_apply.punch_id],[midOut,midOut]);
  check('다른 근무의 출퇴근은 그대로 유지',(await db.query('SELECT id FROM attendance_effective_punches WHERE id IN ($1,$2) ORDER BY id',[laterIn,laterOut])).rows.map(r=>r.id).sort(),[laterIn,laterOut].sort());
  check('시스템 정정으로 대상 대체된 대기 요청은 기존대로 자동 반려',await review(pendingOut,true),null);
  check('시스템 대체 요청 상태 재조회',(await reqState(pendingOut)).status,'rejected');
  const sameDayReq=await request(midnight,'change',midnightApplied,null,at(-30));
  const sameDayApplied=await review(sameDayReq,true);
  check('같은 날짜 출근 정정은 불필요한 짝 정정 없음',(await reqState(sameDayReq)).paired_applied_punch_id,null);
  const crossAgain=await request(midnight,'change',sameDayApplied,null,at(30));
  await review(crossAgain,true);
  const crossAgainState=await reqState(crossAgain);
  check('다시 날짜를 넘기면 시스템 정정 체인을 보존',(await db.query('SELECT supersedes_id FROM attendance_punches WHERE id=$1',[crossAgainState.paired_applied_punch_id])).rows[0].supersedes_id,pairedRow.id);
  check('승인 시 flags 초기화 정책 유지',pairedRow.flags,[]);

  // 원자성: 시스템 짝 INSERT 실패 시 출근 정정/요청 승인도 모두 롤백되어야 한다.
  const atomicEmp=await fixtureEmployee();
  const atomicIn=await manual(atomicEmp,'clock_in',at(60));
  await manual(atomicEmp,'clock_out',at(180));
  const atomicReq=await request(atomicEmp,'change',atomicIn,null,at(-60));
  await db.exec(`CREATE FUNCTION public.qa_reject_system_pair() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.note='출근 날짜 변경에 따른 퇴근 귀속 정정' THEN RAISE EXCEPTION 'QA_SYSTEM_PAIR_FAILURE'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER qa_reject_system_pair BEFORE INSERT ON public.attendance_punches FOR EACH ROW EXECUTE FUNCTION public.qa_reject_system_pair();`);
  await rejects('시스템 정정 실패 시 승인 전체 원자 롤백','QA_SYSTEM_PAIR_FAILURE',()=>review(atomicReq,true));
  await db.exec('DROP TRIGGER qa_reject_system_pair ON public.attendance_punches; DROP FUNCTION public.qa_reject_system_pair()');
  check('시스템 정정 실패 후 요청은 pending',(await reqState(atomicReq)).status,'pending');
  check('시스템 정정 실패 후 원본만 2개',(await db.query('SELECT count(*)::int n FROM attendance_punches WHERE employee_id=$1',[atomicEmp])).rows[0].n,2);

  const limit16=await fixtureEmployee();
  const limitIn=await manual(limit16,'clock_in',at(60));
  const limitOut=await manual(limit16,'clock_out',at(1020));
  check('정확히 16시간도 자동 퇴근과 동일한 짝',(await db.query('SELECT (attendance_shift_partner($1)).id AS id',[limitIn])).rows[0].id,limitOut);
  const flagsEmp=await fixtureEmployee();
  const day=(await db.query('SELECT extract(dow FROM $1::timestamptz AT TIME ZONE \'Asia/Seoul\')::int n',[at(0)])).rows[0].n;
  await db.query("INSERT INTO employee_schedules(store_id,employee_id,day_of_week,is_working,start_time,end_time) VALUES ($1,$2,$3,true,'22:00','02:00')",[pol.store,flagsEmp,day]);
  await manual(flagsEmp,'clock_in',at(1320));
  const flagsAt=(eid,kind,time)=>db.query('SELECT attendance_schedule_flags($1,$2,$3) AS flags',[eid,kind,time]).then(r=>r.rows[0].flags);
  check('야간 퇴근: 자정 전 23시는 늦은 퇴근 아님',await flagsAt(flagsEmp,'clock_out',at(1380)),[]);
  check('야간 퇴근: 다음날 02:10 정확한 경계',await flagsAt(flagsEmp,'clock_out',at(1570)),[]);
  check('야간 퇴근: 다음날 02:10:01부터 표시',await flagsAt(flagsEmp,'clock_out',new Date(new Date(at(1570)).getTime()+1000).toISOString()),['late_clock_out']);
  const actualNightOut=await manual(flagsEmp,'clock_out',at(1571));
  check('실제 직접 기록도 야간 late_clock_out 저장',(await db.query('SELECT flags FROM attendance_punches WHERE id=$1',[actualNightOut])).rows[0].flags,['late_clock_out']);
  const noInEmp=await fixtureEmployee();
  await db.query("INSERT INTO employee_schedules(store_id,employee_id,day_of_week,is_working,start_time,end_time) VALUES ($1,$2,$3,true,'22:00','02:00')",[pol.store,noInEmp,day]);
  check('출근 누락 시에도 전날 야간 스케줄 판정',await flagsAt(noInEmp,'clock_out',at(1571)),['late_clock_out']);
  const dayEmp=await fixtureEmployee();
  await db.query("INSERT INTO employee_schedules(store_id,employee_id,day_of_week,is_working,start_time,end_time) VALUES ($1,$2,$3,true,'09:00','17:00')",[pol.store,dayEmp,day]);
  await manual(dayEmp,'clock_in',at(540));
  check('주간 17:10은 허용',await flagsAt(dayEmp,'clock_out',at(1030)),[]);
  check('주간 17:11 늦은 퇴근',await flagsAt(dayEmp,'clock_out',at(1031)),['late_clock_out']);
  check('이른 출근 08:50 경계 유지',await flagsAt(dayEmp,'clock_in',at(530)),[]);
  check('이른 출근 08:49 유지',await flagsAt(dayEmp,'clock_in',at(529)),['early_clock_in']);
  await db.query("UPDATE employee_schedules SET start_time='09:00',end_time='09:00' WHERE employee_id=$1",[dayEmp]);
  check('시작=종료 스케줄은 기존대로 늦은 퇴근 표시 제외',await flagsAt(dayEmp,'clock_out',at(1031)),[]);
  const noSchedule=await fixtureEmployee();
  check('스케줄 없는 출근 기존 표시 유지',await flagsAt(noSchedule,'clock_in',at(540)),['no_schedule']);
  check('스케줄 없는 퇴근 기존 표시 유지',await flagsAt(noSchedule,'clock_out',at(1031)),[]);
  for (const sql of [
    'SELECT attendance_can_review_employee($1)', 'SELECT attendance_shift_partner($1)',
    "SELECT attendance_validate_correction_order($1,'change',null,null,now())"
  ]) for (const who of [null,pol.part]) await rejects('정책 내부 도우미 직접 호출 차단','permission denied',()=>as(who,sql,[pe.part]));

  const longShift=await fixtureEmployee();
  const longIn=await manual(longShift,'clock_in',at(60));
  await manual(longShift,'clock_out',at(180));
  const longFirst=await review(await request(longShift,'change',longIn,null,at(-1200)),true);
  const longSecondReq=await request(longShift,'change',longFirst,null,at(-1500));
  const longSecond=await review(longSecondReq,true);
  const longSecondState=await reqState(longSecondReq);
  ok('정정으로 16시간을 넘긴 짝도 다음 날짜 정정에서 유지',longSecondState.paired_applied_punch_id);
  check('늘어난 근무의 짝 날짜도 두 번째 출근 날짜를 따름',
    (await db.query('SELECT work_date FROM attendance_punches WHERE id=$1',[longSecondState.paired_applied_punch_id])).rows[0].work_date.getTime(),
    (await db.query('SELECT work_date FROM attendance_punches WHERE id=$1',[longSecond])).rows[0].work_date.getTime());


  const sameDateLong=await fixtureEmployee();
  const sameDateIn=await manual(sameDateLong,'clock_in',at(480));
  const sameDateOut=await manual(sameDateLong,'clock_out',at(1380));
  const sameDateInReq=await request(sameDateLong,'change',sameDateIn,null,at(0));
  const sameDateInApplied=await review(sameDateInReq,true);
  check('같은 날짜에서 16시간을 넘게 늘려도 시스템 퇴근 불필요',(await reqState(sameDateInReq)).paired_applied_punch_id,null);
  const laterLongOut=await review(await request(sameDateLong,'change',sameDateOut,null,at(1500)),true);
  check('명시 이력으로 짝을 역방향 찾아 퇴근 정정도 출근 날짜 유지',
    (await db.query('SELECT work_date FROM attendance_punches WHERE id=$1',[laterLongOut])).rows[0].work_date.getTime(),
    (await db.query('SELECT work_date FROM attendance_punches WHERE id=$1',[sameDateInApplied])).rows[0].work_date.getTime());

  const currentPair=await fixtureEmployee();
  const currentIn=await manual(currentPair,'clock_in',at(60));
  const currentOut=await manual(currentPair,'clock_out',at(180));
  const currentInReq=await request(currentPair,'change',currentIn,null,at(-60));
  const latestOut=await review(await request(currentPair,'change',currentOut,null,at(200)),true);
  await review(currentInReq,true);
  const currentState=await reqState(currentInReq);
  check('승인 시 최신 유효 짝 퇴근을 기준으로 시스템 정정',
    (await db.query('SELECT supersedes_id FROM attendance_punches WHERE id=$1',[currentState.paired_applied_punch_id])).rows[0].supersedes_id,latestOut);
  check('신청/승인 시점의 다른 짝 버전도 각각 보존',
    [currentState.original_snapshot.paired_original.punch_id,currentState.original_snapshot.paired_before_apply.punch_id],[currentOut,latestOut]);
  const unpaired=await fixtureEmployee();
  const unpairedIn=await manual(unpaired,'clock_in',at(60));
  const unpairedReq=await request(unpaired,'change',unpairedIn,null,at(-60));
  await review(unpairedReq,true);
  check('짝 퇴근이 없으면 시스템 퇴근을 만들지 않음',(await reqState(unpairedReq)).paired_applied_punch_id,null);
  const lateChange=await request(flagsEmp,'change',actualNightOut,null,at(1572));
  const lateChanged=await review(lateChange,true);
  check('늦은 퇴근의 정정 승인도 기존 flags 초기화 유지',(await db.query('SELECT flags FROM attendance_punches WHERE id=$1',[lateChanged])).rows[0].flags,[]);
  const veryLate=await fixtureEmployee();
  await db.query("INSERT INTO employee_schedules(store_id,employee_id,day_of_week,is_working,start_time,end_time) VALUES ($1,$2,$3,true,'22:00','02:00')",[pol.store,veryLate,day]);
  await manual(veryLate,'clock_in',at(1320));
  check('열린 야간 근무가 16시간 넘어도 늦은 퇴근 표시',await flagsAt(veryLate,'clock_out',at(2340)),['late_clock_out']);
  await db.query('UPDATE employees SET is_active=false WHERE id=$1',[pe.manager]);
  const inactiveAdminReq=await request(pe.part,'add',null,'clock_in',at(3000));
  await rejects('비활성 점장은 승인 불가','ATTENDANCE_ADMIN_REQUIRED',()=>review(inactiveAdminReq,true,pol.manager));
  await review(inactiveAdminReq,false);
  await db.query('UPDATE employees SET is_active=true WHERE id=$1',[pe.manager]);

  await db.query('DELETE FROM employees WHERE id=$1',[midnight]);
  check('직원 삭제 연쇄 보존 정책: 관련 출퇴근 삭제 허용',(await db.query('SELECT count(*)::int n FROM attendance_punches WHERE employee_id=$1',[midnight])).rows[0].n,0);


  // 13. QA-QR-REVIEW-FIX-20261117: M1/종류 변경/명확한 add 충돌/잠금 순서 회귀.
  const exactEmp=await fixtureEmployee();
  const exactIn=await manual(exactEmp,'clock_in','2026-11-10T01:00:00+09:00');
  const exactOut=await manual(exactEmp,'clock_out','2026-11-10T17:00:00+09:00');
  const exactReq=await request(exactEmp,'change',exactIn,null,'2026-11-09T23:00:00+09:00');
  await review(exactReq,true);
  const exactState=await reqState(exactReq);
  ok('M1: 정확히16시간 출근 날짜 정정 시 시스템 짝 생성',exactState.paired_applied_punch_id);
  const exactRows=(await db.query('SELECT kind,work_date FROM attendance_effective_punches WHERE employee_id=$1 ORDER BY punched_at',[exactEmp])).rows;
  check('M1: 11/10 01~17 출근을 11/9 23시로 정정하면 양쪽 11/9',exactRows.map(r=>r.work_date.toISOString().slice(0,10)),['2026-11-09','2026-11-09']);
  check('M1: 시스템 퇴근은 원래 정확히16h의 퇴근을 계승',(await db.query('SELECT supersedes_id FROM attendance_punches WHERE id=$1',[exactState.paired_applied_punch_id])).rows[0].supersedes_id,exactOut);
  const exactNight=await fixtureEmployee();
  await manual(exactNight,'clock_in',at(1320));
  const exactNightOut=await manual(exactNight,'clock_out',at(2280));
  check('자정을 넘는 정확히16h 퇴근도 원래 출근 날짜에 귀속',
    (await db.query('SELECT work_date FROM attendance_punches WHERE id=$1',[exactNightOut])).rows[0].work_date.getTime(),
    (await db.query('SELECT kst_date($1) AS d',[at(1320)])).rows[0].d.getTime());
  const kindEmp=await fixtureEmployee();
  const kindIn=await manual(kindEmp,'clock_in',at(540));
  const kindOut=await manual(kindEmp,'clock_out',at(1020));
  await rejects('종류 우회 첫 change: in09→out09 거절','ATTENDANCE_INPUT_INVALID',()=>request(kindEmp,'change',kindIn,'clock_out',at(540)));
  await rejects('종류 우회 둘째 change: out17→in17 거절','ATTENDANCE_INPUT_INVALID',()=>request(kindEmp,'change',kindOut,'clock_in',at(1020)));
  check('종류 변경 거절 후 원래 in09/out17 유지',(await db.query('SELECT kind FROM attendance_effective_punches WHERE employee_id=$1 ORDER BY punched_at',[kindEmp])).rows.map(r=>r.kind),['clock_in','clock_out']);
  const legacyKind=await request(kindEmp,'change',kindIn,null,at(550));
  await db.query("UPDATE attendance_correction_requests SET kind='clock_out' WHERE id=$1",[legacyKind]);
  await rejects('승인 시 기존/변조된 종류 변경 요청도 거절','ATTENDANCE_INPUT_INVALID',()=>review(legacyKind,true));
  check('종류 변경 승인 거절은 pending 유지',(await reqState(legacyKind)).status,'pending');
  await review(legacyKind,false);
  for (const kind of ['clock_in','clock_out']) {
    await rejects(`add ${kind}: 이미 닫힌 같은 근무 내부 삽입 거절`,'ATTENDANCE_ORDER_INVALID',()=>request(kindEmp,'add',null,kind,at(780)));
  }
  const fillEmp=await fixtureEmployee();
  await manual(fillEmp,'clock_in',at(540));
  const pendingFill=await request(fillEmp,'add',null,'clock_in',at(780));
  await manual(fillEmp,'clock_out',at(1020));
  await rejects('add 승인 시 새로 닫힌 근무와 충돌 재검사','ATTENDANCE_ORDER_INVALID',()=>review(pendingFill,true));
  await review(pendingFill,false);
  ok('add: 닫힌 근무 밖의 다음 출근 누락 추가는 허용',await review(await request(kindEmp,'add',null,'clock_in',at(1080)),true));
  const isolated=await fixtureEmployee();
  ok('add: 짝 없는 퇴근은 이전 근무로 추정하지 않고 지원',await review(await request(isolated,'add',null,'clock_out',at(540)),true));
  const punchLockSource=await source('public.punch_attendance(text,text)');
  ok('M2 소스 회귀: 스캔 직원 KEY SHARE가 기기 행 잠금보다 먼저',punchLockSource.indexOf('FOR KEY SHARE;')>=0 && punchLockSource.indexOf('FOR KEY SHARE;')<punchLockSource.indexOf('WHERE id = dev_id FOR UPDATE;'));
  const reviewLockSource=await source('public.review_attendance_correction(uuid,boolean,text)');
  ok('M2 소스 회귀: 리뷰 직원 KEY SHARE가 요청 행 잠금보다 먼저',reviewLockSource.indexOf('FOR KEY SHARE;')>=0 && reviewLockSource.indexOf('FOR KEY SHARE;')<reviewLockSource.indexOf('employee_id=emp.id FOR UPDATE;'));
  for (const name of ['public.request_attendance_correction(uuid,uuid,text,uuid,text,timestamptz,text)','public.record_manual_attendance(uuid,uuid,text,timestamptz,text)']) {
    const sqlSource=await source(name);
    ok(`${name} 직원 KEY SHARE가 직원 advisory보다 먼저`,sqlSource.indexOf('FOR KEY SHARE;')>=0 && sqlSource.indexOf('FOR KEY SHARE;')<sqlSource.indexOf('PERFORM pg_advisory_xact_lock'));
  }

  console.log(`QR attendance SQL: ${checks} checks passed`);
} finally {
  await db.close();
}

// QR-A02/A04/A05 자동 인건비 계약: 별도 격리 DB에서 현재 역할 체인까지 검증.
await import('./validate-qr-auto-work-sql.mjs');
