// 로컬 PGlite 전용. 실제 Supabase 연결·환경변수·운영 데이터는 사용하지 않는다.
// QR 출퇴근(20261116120000_qr_attendance.sql) 검증: 토큰·재사용·권한·정정·삭제 대기 매장·파기.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.RATTLE_PGLITE_MODULE ?? '@electric-sql/pglite');
const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
const db = new PGlite({ extensions: { pgcrypto } });
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const u = { owner: id(1), alice: id(2), bob: id(3), other: id(4), outsider: id(5) };
const s = { main: id(11), second: id(12) };
const e = { alice: id(21), bob: id(22), aliceSecond: id(23), outsider: id(24) };
let checks = 0;
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (label, value) => { assert.ok(value, label); checks++; };
async function as(user, sql, params = []) {
  await db.exec(user ? 'SET ROLE authenticated' : 'SET ROLE anon');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
  try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); }
}
async function rejects(label, code, fn) {
  await assert.rejects(fn, err => String(err.message).includes(code), label); checks++;
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
    CREATE TABLE employees(id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, user_id uuid, name text NOT NULL, is_active boolean NOT NULL DEFAULT true);
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

  await db.exec(`INSERT INTO auth.users(id) VALUES ('${u.owner}'),('${u.alice}'),('${u.bob}'),('${u.other}'),('${u.outsider}');
    INSERT INTO stores(id, owner_id, name) VALUES ('${s.main}','${u.owner}','본점'),('${s.second}','${u.other}','2호점');
    INSERT INTO store_members(store_id,user_id,role,status) VALUES
      ('${s.main}','${u.alice}','member','approved'),('${s.main}','${u.bob}','member','approved'),('${s.second}','${u.alice}','member','approved');
    INSERT INTO employees(id, store_id, user_id, name) VALUES
      ('${e.alice}','${s.main}','${u.alice}','김앨리스'),('${e.bob}','${s.main}','${u.bob}','박밥'),
      ('${e.aliceSecond}','${s.second}','${u.alice}','김앨리스');`);

  // 1. 기기 등록
  await rejects('직원 연결 없는 계정은 기기 등록 불가', 'ATTENDANCE_EMPLOYEE_REQUIRED', () => as(u.outsider, 'SELECT register_attendance_device($1)', ['폰']));
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
  const approvedFirst = await punch(scanner2.token, await qrFor(u.alice, aliceNew.device_id, aliceNew.secret)).catch(() => null);
  ok('승인으로 바뀐 기기의 첫 기록은 확인 필요 표시', approvedFirst === null || approvedFirst.duplicate || approvedFirst.flags.includes('new_device'));
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

  // 8. 퇴사 시 기기 자동 해제(다른 매장 근무가 없을 때만)
  await db.query('UPDATE employees SET is_active=false WHERE id=$1', [e.bob]);
  check('퇴사 → 기기 해제', (await db.query('SELECT status FROM attendance_devices WHERE id=$1', [bobDev.device_id])).rows[0].status, 'revoked');
  await db.query('UPDATE employees SET is_active=false WHERE id=$1', [e.alice]);
  check('다른 매장 근무 중이면 유지', (await db.query("SELECT count(*)::int n FROM attendance_devices WHERE user_id=$1 AND status='active'", [u.alice])).rows[0].n, 1);
  await rejects('퇴사한 매장에서는 스캔 거절', 'ATTENDANCE_NOT_EMPLOYEE', async () => punch(scanner.token, await qrFor(u.alice, aliceNew.device_id, aliceNew.secret)));

  // 9. 매장폰 해제
  await as(u.owner, 'SELECT revoke_attendance_scanner($1)', [scanner.scanner_id]);
  await rejects('해제된 매장폰 즉시 거절', 'ATTENDANCE_SCANNER_INVALID', async () => punch(scanner.token, 'rattle-punch:v1.x'));

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

  console.log(`QR attendance SQL: ${checks} checks passed`);
} finally {
  await db.close();
}
