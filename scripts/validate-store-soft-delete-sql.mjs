// 로컬 PGlite 전용. 실제 Supabase 연결·환경변수·운영 데이터는 사용하지 않는다.
// 매장 7일 유예 삭제(소프트 삭제)·복구·파기 검증. pg_cron 예약 파일은 원격 전용이라 제외한다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.RATTLE_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const u = { owner: id(1), member: id(2), stranger: id(3) };
const s = { full: id(11), empty: id(12), pos: id(13), expired: id(14), other: id(15) };
let checks = 0;
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks++; };
async function as(user, sql, params = []) {
  await db.exec('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user]);
  try { return await db.query(sql, params); } finally { await db.exec('RESET ROLE'); }
}
async function rejects(label, code, fn) {
  await assert.rejects(fn, e => String(e.message).includes(code), label); checks++;
}
const migration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

try {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
    CREATE TABLE stores(id uuid PRIMARY KEY, owner_id uuid NOT NULL, name text NOT NULL, toss_merchant_id text);
    CREATE TABLE store_members(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, user_id uuid NOT NULL, role text NOT NULL, status text NOT NULL);
    CREATE TABLE store_taxonomies(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, name text);
    CREATE TABLE employees(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, name text);
    CREATE TABLE expenses(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, amount numeric);
    CREATE TABLE payroll_work_submissions(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT);
    CREATE TABLE payroll(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, employee_id uuid REFERENCES employees(id) ON DELETE CASCADE, work_submission_id uuid REFERENCES payroll_work_submissions(id) ON DELETE RESTRICT);
    CREATE TABLE payroll_daily_work(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT);
    CREATE TABLE payroll_daily_work_history(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT);
    CREATE TABLE payroll_work_history(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, payroll_id uuid);
    CREATE FUNCTION audit_payroll_work() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO payroll_work_history(store_id,payroll_id) VALUES (OLD.store_id, OLD.id); RETURN OLD; END $$;
    CREATE TRIGGER audit_payroll_work AFTER DELETE ON payroll FOR EACH ROW EXECUTE FUNCTION audit_payroll_work();
    CREATE TABLE recurring_fixed_expenses(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT, source_expense_id uuid REFERENCES expenses(id) ON DELETE RESTRICT);
    CREATE TABLE recurring_fixed_expense_versions(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, rule_id uuid NOT NULL REFERENCES recurring_fixed_expenses(id) ON DELETE RESTRICT);
    CREATE FUNCTION protect_recurring_expense_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM recurring_fixed_expenses r WHERE r.source_expense_id=OLD.id) THEN RAISE EXCEPTION 'RECURRING_EXPENSE_SOURCE_LOCKED'; END IF; RETURN OLD; END $$;
    CREATE TRIGGER recurring_expense_source_guard BEFORE DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION protect_recurring_expense_source();
    ALTER TABLE stores ENABLE ROW LEVEL SECURITY; ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;
    ALTER TABLE employees ENABLE ROW LEVEL SECURITY; ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;`);
  // 운영 마이그레이션의 기존 접근 함수(시그니처 그대로)와 빈 매장 삭제 함수.
  await db.exec(`CREATE FUNCTION is_store_admin(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT false $$;
    CREATE FUNCTION is_store_member(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT false $$;
    CREATE FUNCTION user_has_store_access(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT false $$;`);
  await db.exec(await migration('20261028010000_delete_empty_owned_store.sql'));
  // 기존 허용 정책(요약본): 소유자·승인 구성원은 매장과 매장 자료를 본다.
  await db.exec(`CREATE POLICY stores_select ON stores FOR SELECT USING (owner_id = auth.uid() OR is_store_member(id));
    CREATE POLICY stores_update ON stores FOR UPDATE USING (owner_id = auth.uid());
    CREATE POLICY members_select ON store_members FOR SELECT USING (user_id = auth.uid() OR is_store_admin(store_id));
    CREATE POLICY employees_all ON employees FOR ALL USING (store_id IN (SELECT store_id FROM store_members WHERE user_id = auth.uid() AND status='approved') OR is_store_admin(store_id));
    CREATE POLICY expenses_all ON expenses FOR ALL USING (is_store_member(store_id));`);
  await db.exec(await migration('20261114120000_store_soft_delete.sql'));
  await db.exec(`CREATE FUNCTION join_by_invite(p_store uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
      INSERT INTO store_members(store_id,user_id,role,status) VALUES (p_store, auth.uid(), 'member', 'pending') $$;
    CREATE FUNCTION transfer_owner(p_store uuid, p_to uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
      UPDATE stores SET owner_id = p_to WHERE id = p_store AND owner_id = auth.uid() $$;
    GRANT EXECUTE ON FUNCTION join_by_invite(uuid), transfer_owner(uuid,uuid) TO authenticated;`);
  // 가드 누락 검사: stores를 참조하는 모든 테이블에 RESTRICTIVE 정책과 쓰기 트리거가 있어야 한다.
  const missing = (await db.query(`SELECT t.relname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      WHERE c.contype='f' AND c.confrelid='public.stores'::regclass
        AND (NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename=t.relname AND p.permissive='RESTRICTIVE' AND p.policyname LIKE 'deleted_store_guard_%')
          OR NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid=t.oid AND g.tgname LIKE 'guard_deleted_store_%'))`)).rows;
  check('모든 매장 참조 테이블에 읽기·쓰기 가드', missing, []);

  await db.exec(`INSERT INTO stores(id,owner_id,name,toss_merchant_id) VALUES
      ('${s.full}','${u.owner}','기록 매장',NULL), ('${s.empty}','${u.owner}','빈 매장',NULL),
      ('${s.pos}','${u.owner}','POS 매장','m-1'), ('${s.expired}','${u.owner}','만료 매장',NULL),
      ('${s.other}','${u.owner}','유지 매장',NULL);
    INSERT INTO store_members(store_id,user_id,role,status) VALUES
      ('${s.full}','${u.owner}','admin','approved'), ('${s.full}','${u.member}','member','approved'),
      ('${s.expired}','${u.member}','member','approved'), ('${s.other}','${u.member}','member','approved');
    INSERT INTO store_taxonomies(store_id,name) VALUES ('${s.empty}','기본');`);
  for (const store of [s.full, s.expired, s.other]) {
    await db.exec(`WITH e AS (INSERT INTO employees(store_id,name) VALUES ('${store}','직원') RETURNING id),
        x AS (INSERT INTO expenses(store_id,amount) VALUES ('${store}',1000) RETURNING id),
        sub AS (INSERT INTO payroll_work_submissions(store_id,employee_id) SELECT '${store}', id FROM e RETURNING id, employee_id),
        p AS (INSERT INTO payroll(store_id,employee_id,work_submission_id) SELECT '${store}', employee_id, id FROM sub RETURNING id),
        d AS (INSERT INTO payroll_daily_work(store_id,employee_id) SELECT '${store}', id FROM e RETURNING id),
        h AS (INSERT INTO payroll_daily_work_history(store_id,employee_id) SELECT '${store}', id FROM e RETURNING id),
        r AS (INSERT INTO recurring_fixed_expenses(store_id,source_expense_id) SELECT '${store}', id FROM x RETURNING id)
      INSERT INTO recurring_fixed_expense_versions(rule_id) SELECT id FROM r;`);
  }

  // 1. 기록 있는 매장 → 7일 유예
  const scheduled = (await as(u.owner, 'SELECT delete_owned_store($1) AS r', [s.full])).rows[0].r;
  check('기록 매장은 유예 삭제', scheduled.mode, 'scheduled');
  const due = (await db.query('SELECT extract(epoch FROM purge_after - deleted_at)::int AS gap FROM stores WHERE id=$1', [s.full])).rows[0].gap;
  check('유예 기간 7일', due, 7 * 24 * 3600);
  check('구성원은 매장 목록에서 못 봄', (await as(u.member, 'SELECT id FROM stores WHERE id=$1', [s.full])).rows.length, 0);
  check('소유자도 일반 조회로는 못 봄', (await as(u.owner, 'SELECT id FROM stores WHERE id=$1', [s.full])).rows.length, 0);
  check('구성원은 직원 자료 접근 불가', (await as(u.member, 'SELECT id FROM employees WHERE store_id=$1', [s.full])).rows.length, 0);
  check('구성원 판정 함수 false', (await as(u.member, 'SELECT is_store_member($1) AS ok', [s.full])).rows[0].ok, false);
  check('관리자 판정 함수 false', (await as(u.owner, 'SELECT is_store_admin($1) AS ok', [s.full])).rows[0].ok, false);
  check('다른 매장 자료는 그대로', (await as(u.member, 'SELECT count(*)::int AS n FROM expenses WHERE store_id=$1', [s.other])).rows[0].n, 1);
  await rejects('삭제 대기 매장에 쓰기 불가', 'STORE_DELETED', () => as(u.member, 'INSERT INTO expenses(store_id,amount) VALUES ($1,1)', [s.full]));
  await rejects('보안 정의 함수로 삭제 대기 매장 가입 불가', 'STORE_DELETED', () => as(u.stranger, 'SELECT join_by_invite($1)', [s.full]));
  await rejects('삭제 대기 매장 소유권 이전 불가', 'STORE_DELETED', () => as(u.owner, 'SELECT transfer_owner($1,$2)', [s.full, u.member]));
  await rejects('service_role도 삭제 대기 매장에 쓰기 불가', 'STORE_DELETED', async () => {
    await db.exec('SET ROLE service_role');
    try { await db.query('INSERT INTO expenses(store_id,amount) VALUES ($1,1)', [s.full]); } finally { await db.exec('RESET ROLE'); }
  });
  check('소유자 삭제 목록', (await as(u.owner, 'SELECT id FROM list_my_deleted_stores()')).rows.map(r => r.id), [s.full]);
  check('다른 사용자 삭제 목록 비어 있음', (await as(u.member, 'SELECT id FROM list_my_deleted_stores()')).rows.length, 0);
  await rejects('중복 삭제 거부', 'STORE_DELETE_OWNER_REQUIRED', () => as(u.member, 'SELECT delete_owned_store($1)', [s.full]));
  await rejects('이미 삭제 대기', 'STORE_DELETE_ALREADY_SCHEDULED', () => as(u.owner, 'SELECT delete_owned_store($1)', [s.full]));

  // 2. 복구
  await rejects('구성원은 복구 불가', 'STORE_RESTORE_NOT_FOUND', () => as(u.member, 'SELECT restore_deleted_store($1)', [s.full]));
  await as(u.owner, 'SELECT restore_deleted_store($1)', [s.full]);
  check('복구 후 구성원 다시 접근', (await as(u.member, 'SELECT count(*)::int AS n FROM employees WHERE store_id=$1', [s.full])).rows[0].n, 1);
  check('복구 후 삭제 목록 비어 있음', (await as(u.owner, 'SELECT id FROM list_my_deleted_stores()')).rows.length, 0);
  await rejects('정상 매장 복구 거부', 'STORE_RESTORE_NOT_FOUND', () => as(u.owner, 'SELECT restore_deleted_store($1)', [s.full]));

  // 3. 빈 매장은 즉시 삭제, POS 매장은 거부, 비소유자는 거부
  check('빈 매장 즉시 삭제', (await as(u.owner, 'SELECT delete_owned_store($1) AS r', [s.empty])).rows[0].r.mode, 'deleted');
  check('빈 매장 행 없음', (await db.query('SELECT 1 FROM stores WHERE id=$1', [s.empty])).rows.length, 0);
  await rejects('POS 연결 매장 거부', 'STORE_DELETE_POS_CONNECTED', () => as(u.owner, 'SELECT delete_owned_store($1)', [s.pos]));
  await rejects('비소유자 삭제 거부', 'STORE_DELETE_OWNER_REQUIRED', () => as(u.stranger, 'SELECT delete_owned_store($1)', [s.other]));

  // 4. 파기: 기한 지난 매장만, RESTRICT 하위 기록까지
  await as(u.owner, 'SELECT delete_owned_store($1)', [s.expired]);
  await as(u.owner, 'SELECT delete_owned_store($1)', [s.full]);
  // 테스트 전용: 시간 경과를 흉내 내려고 행 가드를 잠시 우회한다.
  await db.exec(`BEGIN; SELECT set_config('rattle.store_purge','on',true);
    UPDATE stores SET deleted_at = now() - interval '8 days', purge_after = now() - interval '1 day' WHERE id='${s.expired}'; COMMIT;`);
  await rejects('만료 후 복구 불가', 'STORE_RESTORE_EXPIRED', () => as(u.owner, 'SELECT restore_deleted_store($1)', [s.expired]));
  check('만료 매장은 삭제 목록에서 빠짐', (await as(u.owner, 'SELECT id FROM list_my_deleted_stores()')).rows.map(r => r.id), [s.full]);
  await rejects('일반 사용자 파기 실행 불가', 'permission denied', () => as(u.owner, 'SELECT purge_expired_deleted_stores()'));
  await db.exec('SET ROLE service_role');
  const purged = (await db.query('SELECT purge_expired_deleted_stores() AS n')).rows[0].n;
  await db.exec('RESET ROLE');
  check('기한 지난 1개 매장 파기', purged, 1);
  for (const table of ['stores', 'employees', 'expenses', 'payroll', 'payroll_work_submissions', 'payroll_daily_work', 'payroll_daily_work_history', 'recurring_fixed_expenses', 'store_members']) {
    const col = table === 'stores' ? 'id' : 'store_id';
    check(`${table}: 만료 매장 기록 파기`, (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${col}=$1`, [s.expired])).rows[0].n, 0);
  }
  check('파기 중 감사 이력도 함께 정리', (await db.query('SELECT count(*)::int AS n FROM payroll_work_history WHERE store_id=$1', [s.expired])).rows[0].n, 0);
  check('파기 실패 기록 없음', (await db.query('SELECT count(*)::int AS n FROM store_purge_failures')).rows[0].n, 0);
  check('파기 후 우회 설정 해제', (await db.query("SELECT coalesce(current_setting('rattle.store_purge', true), '') AS v")).rows[0].v === 'on', false);
  await as(u.owner, 'SELECT transfer_owner($1,$2)', [s.other, u.owner]);
  checks++;
  check('반복 비용 버전 파기', (await db.query('SELECT count(*)::int AS n FROM recurring_fixed_expense_versions')).rows[0].n, 2);
  check('유예 중 매장은 남음', (await db.query('SELECT count(*)::int AS n FROM employees WHERE store_id=$1', [s.full])).rows[0].n, 1);
  check('유지 매장 영향 없음', (await db.query('SELECT count(*)::int AS n FROM payroll WHERE store_id=$1', [s.other])).rows[0].n, 1);

  console.log(`store soft delete SQL: ${checks} checks passed`);
} finally {
  await db.close();
}
