// 로컬 PGlite 전용. QA-ROLE-20261117 / task_90906d6dcc29, 가상 계정·매장만 사용.
// 단일 연결의 revision CAS/잠금 순서 검사는 실제 다중 연결 경합 검증을 대신하지 않는다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.RATTLE_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const u = { owner: id(1), manager: id(2), staff: id(3), pt: id(4), pending: id(5), legacy: id(6), outside: id(7), owner2: id(8), unlinked: id(9) };
const s = { main: id(11), second: id(12) };
const m = Object.fromEntries(Object.entries(u).map(([key], i) => [key, id(31 + i)]));
const e = Object.fromEntries(Object.entries(u).map(([key], i) => [key, id(51 + i)]));
let checks = 0;
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (label, actual) => { assert.ok(actual, label); checks++; };
const migration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
async function as(user, sql, params = []) {
  await db.exec(user ? 'SET ROLE authenticated' : 'SET ROLE anon');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  try { return await db.query(sql, params); }
  finally { await db.exec('RESET ROLE'); }
}
async function rejects(label, code, fn) {
  await assert.rejects(fn, err => String(err.message).includes(code), label); checks++;
}
const access = (user, store = s.main) => as(user, 'SELECT get_my_store_access($1) AS r', [store]).then(r => r.rows[0].r);
const state = (store = s.main) => db.query('SELECT * FROM private.store_managers WHERE store_id=$1', [store]).then(r => r.rows[0]);
const assign = async (user, member, rev, store = s.main) =>
  (await as(user, 'SELECT set_store_manager($1,$2,$3) AS r', [store, member, rev])).rows[0].r;
async function assignCurrent(member = m.manager, store = s.main) {
  return assign(store === s.main ? u.owner : u.owner2, member, (await state(store)).revision, store);
}
try {
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
    CREATE TABLE stores(id uuid PRIMARY KEY,owner_id uuid NOT NULL REFERENCES auth.users(id),name text NOT NULL,deleted_at timestamptz,deleted_by uuid,purge_after timestamptz);
    CREATE TABLE store_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,user_email text,applicant_name text,phone text,
      role text NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('approved','pending','rejected')),UNIQUE(store_id,user_id));
    CREATE TABLE employees(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      name text NOT NULL,phone text,joined_at date,is_active boolean NOT NULL DEFAULT true,
      employment_type text NOT NULL DEFAULT 'regular' CHECK(employment_type IN ('regular','part_time')));
    CREATE TABLE attendance(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
      employee_id uuid REFERENCES employees(id) ON DELETE CASCADE);
    ALTER TABLE stores ENABLE ROW LEVEL SECURITY; ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;
    ALTER TABLE employees ENABLE ROW LEVEL SECURITY; ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    CREATE POLICY stores_delete_owner ON stores FOR DELETE TO authenticated USING(owner_id=auth.uid());
    CREATE FUNCTION is_store_member(sid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
      SELECT EXISTS(SELECT 1 FROM stores WHERE id=sid AND owner_id=auth.uid() AND deleted_at IS NULL)
      OR EXISTS(SELECT 1 FROM store_members m JOIN stores s ON s.id=m.store_id WHERE m.store_id=sid AND m.user_id=auth.uid() AND m.status='approved' AND s.deleted_at IS NULL) $$;
    CREATE POLICY stores_select ON stores FOR SELECT TO authenticated USING(public.is_store_member(id));
    ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;`);
  // 실제 구형 raw admin 정책을 적용한 뒤 새 마이그레이션이 경로를 닫는지 검사한다.
  for (const name of ['20260416_fix_store_members_rls.sql','20260605_stores_update_policy_v2.sql',
    '20260902_fix_store_members_delete_rls.sql','20260608_employee_user_link.sql','20261019_member_employee_auto_link.sql']) {
    await db.exec(await migration(name));
  }
  await db.exec(`CREATE POLICY employees_select ON employees FOR SELECT TO authenticated USING(is_store_member(store_id));
    CREATE POLICY employees_write ON employees FOR ALL TO authenticated USING(is_store_admin(store_id)) WITH CHECK(is_store_admin(store_id));`);
  for (const user of Object.values(u)) await db.query('INSERT INTO auth.users VALUES($1,$2)', [user, 'qa-role@example.invalid']);
  await db.query("INSERT INTO stores(id,owner_id,name,deleted_at) VALUES($1,$2,'QA-ROLE-main',NULL),($3,$4,'QA-ROLE-second',NULL)", [s.main,u.owner,s.second,u.owner2]);
  for (const [key, user] of Object.entries(u)) {
    if (['outside','owner2'].includes(key)) continue;
    await db.query('INSERT INTO store_members(id,store_id,user_id,role,status) VALUES($1,$2,$3,$4,$5)',
      [m[key],s.main,user,['owner','legacy'].includes(key)?'admin':'member',key==='pending'?'pending':'approved']);
    if (key !== 'unlinked') await db.query('INSERT INTO employees(id,store_id,user_id,name,employment_type) VALUES($1,$2,$3,$4,$5)',
      [e[key],s.main,user,`QA-ROLE-${key}`,key==='pt'?'part_time':'regular']);
  }
  const sql = await migration('20261117150000_role_model_core.sql');
  await db.exec(sql);
  check('existing states start unassigned without auto promotion', (await state()).member_id, null);
  for (const [key, expected] of [['owner',true],['manager',false],['staff',false],['pt',false],['pending',false],['legacy',false],['outside',false]]) {
    const r = (await as(u[key], 'SELECT is_store_owner($1) AS owner,is_store_manager($1) AS manager,is_store_admin($1) AS admin', [s.main])).rows[0];
    check(`${key} initial capabilities`,r,{owner:expected,manager:false,admin:expected});
  }
  for (const key of ['manager','staff','pt','pending','legacy','outside','owner2']) {
    await rejects(`${key} cannot appoint`,'STORE_OWNER_REQUIRED',()=>assign(u[key],m.manager,0));
  }
  await rejects('anon has no RPC execute','permission denied',()=>assign(null,m.manager,0));
  await rejects('expected revision required','MANAGER_INPUT_INVALID',()=>assign(u.owner,m.manager,null));
  for (const target of [m.pending,m.unlinked,m.outside,id(999),m.owner]) {
    await rejects('only active approved linked nonowner candidate','MANAGER_CANDIDATE_INVALID',()=>assign(u.owner,target,0));
  }
  await db.query("INSERT INTO store_members(id,store_id,user_id,role,status) VALUES($1,$2,$3,'member','approved')",[m.outside,s.second,u.outside]);
  await rejects('approved other-store member not eligible','MANAGER_CANDIDATE_INVALID',()=>assign(u.owner,m.outside,0));
  await rejects('negative revision invalid','MANAGER_INPUT_INVALID',()=>assign(u.owner,m.manager,-1));
  const first=await assignCurrent();
  for (const uid of [u.staff,u.pt,u.legacy,u.unlinked]) {
    check('ordinary member cannot receive manager member ID',(await access(uid)).manager_member_id,null);
    check('ordinary member cannot receive manager employee ID',(await access(uid)).manager_employee_id,null);
  }

  check('first revision is portable decimal text',first.revision,'1');
  check('first assignee',first.member_id,m.manager);
  check('manager helper',(await as(u.manager,'SELECT is_store_admin($1) AS a,is_store_manager($1) AS m',[s.main])).rows[0],{a:true,m:true});
  check('one store has one current state',(await db.query('SELECT count(*)::int n FROM private.store_managers WHERE store_id=$1',[s.main])).rows[0].n,1);
  await rejects('stale competing assignment fails CAS','MANAGER_REVISION_CONFLICT',()=>assign(u.owner,m.staff,0));
  check('failed CAS preserves winner',(await state()).member_id,m.manager);
  check('same assignment current revision is no-op',(await assignCurrent()).revision,'1');
  await rejects('manager cannot clear self','STORE_OWNER_REQUIRED',()=>assign(u.manager,null,1));
  const cleared=await assign(u.owner,null,(await state()).revision);
  check('owner clear returns durable state',cleared.member_id,null);
  check('owner clear removes attribution',cleared.assigned_at,null);
  await rejects('pre-clear revision cannot overwrite later state','MANAGER_REVISION_CONFLICT',()=>assign(u.owner,m.staff,1));
  const pt=await assignCurrent(m.pt);
  check('PT can be manager',pt.member_id,m.pt);
  await rejects('manager cannot delete own employee row','STORE_OWNER_REQUIRED',()=>as(u.pt,'DELETE FROM employees WHERE id=$1',[e.pt]));
  check('failed self delete retains appointment',(await state()).member_id,m.pt);
  await rejects('manager cannot soft delete store','STORE_OWNER_REQUIRED',()=>as(u.pt,'UPDATE stores SET deleted_at=now() WHERE id=$1',[s.main]));
  check('manager cannot physically delete store',(await as(u.pt,'DELETE FROM stores WHERE id=$1 RETURNING id',[s.main])).rows.length,0);
  check('PT manager normalized role',(await access(u.pt)).role,'manager');
  check('regular staff normalized role',(await access(u.staff)).role,'employee');
  check('old admin has employee role',(await access(u.legacy)).role,'employee');
  check('owner dashboard only owner',(await access(u.pt)).can_view_owner_dashboard,false);
  check('owner capability',(await access(u.owner)).can_manage_managers,true);
  await rejects('pending access denied','STORE_ACCESS_DENIED',()=>access(u.pending));
  await rejects('other store access denied','STORE_ACCESS_DENIED',()=>access(u.outside));
  check('unlinked member has no employee role',(await access(u.unlinked)).role,null);
  for (const key of ['staff','legacy']) {
    check(`${key} cannot update store`,(await as(u[key],'UPDATE stores SET name=\'forbidden\' WHERE id=$1 RETURNING id',[s.main])).rows.length,0);
    check(`${key} cannot delete another member`,(await as(u[key],'DELETE FROM store_members WHERE id=$1 RETURNING id',[m.manager])).rows.length,0);
  }
  check('manager can update ordinary store info',(await as(u.pt,"UPDATE stores SET name='QA-ROLE-renamed' WHERE id=$1 RETURNING id",[s.main])).rows.length,1);
  await rejects('owner cannot directly change owner_id','OWNERSHIP_TRANSFER_REQUIRED',()=>as(u.owner,'UPDATE stores SET owner_id=$1 WHERE id=$2',[u.staff,s.main]));
  await rejects('manager cannot change owner_id','OWNERSHIP_TRANSFER_REQUIRED',()=>as(u.pt,'UPDATE stores SET owner_id=$1 WHERE id=$2',[u.pt,s.main]));
  await rejects('custom GUC is not ownership authorization','OWNERSHIP_TRANSFER_REQUIRED',async()=>{
    await as(u.owner,"SELECT set_config('rattle.owner_transfer','on',false)");
    return as(u.owner,'UPDATE stores SET owner_id=$1 WHERE id=$2',[u.staff,s.main]);
  });
  await rejects('manager cannot change legacy role','STORE_OWNER_REQUIRED',()=>as(u.pt,"UPDATE store_members SET role='admin' WHERE id=$1",[m.staff]));
  check('owner legacy role change allowed',(await as(u.owner,"UPDATE store_members SET role='admin' WHERE id=$1 RETURNING id",[m.staff])).rows.length,1);
  check('legacy role grants no admin',(await as(u.staff,'SELECT is_store_admin($1) a',[s.main])).rows[0].a,false);

  await assignCurrent(m.legacy);
  check('legacy admin may be explicitly appointed by owner',(await as(u.legacy,'SELECT is_store_manager($1) a',[s.main])).rows[0].a,true);
  await assign(u.owner,null,(await state()).revision);
  check('legacy admin loses management after removal',(await as(u.legacy,'SELECT is_store_admin($1) a',[s.main])).rows[0].a,false);

  // 자동 해제 뒤 같은 계정의 재연결·재승인으로 점장 권한을 복원하지 않는다.
  const lifecycle = [
    ["UPDATE employees SET is_active=false WHERE id=$1",e.pt,"UPDATE employees SET is_active=true WHERE id=$1"],
    ["UPDATE employees SET user_id=NULL WHERE id=$1",e.pt,"UPDATE employees SET user_id='"+u.pt+"' WHERE id=$1"],
    ["UPDATE employees SET user_id='"+u.outside+"' WHERE id=$1",e.pt,"UPDATE employees SET user_id='"+u.pt+"' WHERE id=$1"],
    ["UPDATE store_members SET status='rejected' WHERE id=$1",m.pt,"UPDATE store_members SET status='approved' WHERE id=$1"],
  ];
  for (const [change,target,restore] of lifecycle) {
    await assignCurrent(m.pt); const rev=(await state()).revision;
    await as(u.owner,change,[target]);
    check(`${change} clears`,(await state()).member_id,null);
    ok('clear revision increments',BigInt((await state()).revision)>BigInt(rev));
    await rejects('old revision remains invalid after clear','MANAGER_REVISION_CONFLICT',()=>assign(u.owner,m.staff,rev));
    if (change.includes('is_active=false')) await rejects('inactive candidate rejected','MANAGER_CANDIDATE_INVALID',()=>assignCurrent(m.pt));
    await as(u.owner,restore,[target]);
    check('restoration never auto appoints',(await state()).member_id,null);
  }
  await assignCurrent(m.manager);
  await as(u.owner,'DELETE FROM employees WHERE id=$1',[e.manager]);
  check('employee DELETE clears',(await state()).member_id,null);
  await db.query('INSERT INTO employees(id,store_id,user_id,name) VALUES($1,$2,$3,\'QA-ROLE-relinked\')',[e.manager,s.main,u.manager]);
  check('relinked employee not manager',(await as(u.manager,'SELECT is_store_admin($1) a',[s.main])).rows[0].a,false);
  await assignCurrent();
  await as(u.manager,'DELETE FROM store_members WHERE id=$1',[m.manager]);
  check('self member leave clears',(await state()).member_id,null);
  await db.query("INSERT INTO store_members(id,store_id,user_id,role,status) VALUES($1,$2,$3,'member','approved')",[m.manager,s.main,u.manager]);
  await assignCurrent();
  await db.query('DELETE FROM auth.users WHERE id=$1',[u.manager]);
  check('auth deletion clears',(await state()).member_id,null);
  await db.query('INSERT INTO auth.users VALUES($1,\'qa-role@example.invalid\')',[u.manager]);
  await db.query("INSERT INTO store_members(id,store_id,user_id,role,status) VALUES($1,$2,$3,'member','approved')",[m.manager,s.main,u.manager]);
  await db.query('UPDATE employees SET user_id=$1 WHERE id=$2',[u.manager,e.manager]);
  check('account recreated does not restore role',(await state()).member_id,null);
  await assignCurrent(m.pt);
  await db.query("INSERT INTO store_members(id,store_id,user_id,role,status) VALUES($1,$2,$3,'member','approved')",[id(90),s.second,u.pt]);
  await db.query("INSERT INTO employees(id,store_id,user_id,name,employment_type) VALUES($1,$2,$3,'QA-ROLE-multi','part_time')",[id(91),s.second,u.pt]);
  await assign(u.owner2,id(90),0,s.second);
  check('same person can manage multiple stores',(await as(u.pt,'SELECT is_store_manager($1) a,is_store_manager($2) b',[s.main,s.second])).rows[0],{a:true,b:true});
  await as(u.owner,'UPDATE employees SET is_active=false WHERE id=$1',[e.pt]);
  check('only affected store clears',(await as(u.pt,'SELECT is_store_manager($1) a,is_store_manager($2) b',[s.main,s.second])).rows[0],{a:false,b:true});
  await as(u.owner,'UPDATE employees SET is_active=true WHERE id=$1',[e.pt]);
  await assignCurrent(m.pt);
  await rejects('manager cannot transfer','OWNERSHIP_OWNER_REQUIRED',()=>as(u.pt,'SELECT transfer_store_ownership($1,$2)',[s.main,m.staff]));
  await as(u.owner,'SELECT transfer_store_ownership($1,$2)',[s.main,m.staff]);
  check('transfer updates owner',(await db.query('SELECT owner_id FROM stores WHERE id=$1',[s.main])).rows[0].owner_id,u.staff);
  check('transfer clears manager',(await state()).member_id,null);
  check('previous owner has no admin',(await as(u.owner,'SELECT is_store_admin($1) a',[s.main])).rows[0].a,false);
  check('new owner has owner capability',(await access(u.staff)).role,'owner');
  check('authorization consumed',(await db.query('SELECT count(*)::int n FROM private.store_owner_transfers')).rows[0].n,0);
  await rejects('repeating direct owner edit still fails','OWNERSHIP_TRANSFER_REQUIRED',()=>as(u.staff,'UPDATE stores SET owner_id=$1 WHERE id=$2',[u.owner,s.main]));
  for (const role of ['anon','authenticated','service_role']) {
    await db.exec(`SET ROLE ${role}`);
    try { await rejects(`${role} cannot read private state`,'permission denied',()=>db.query('SELECT * FROM private.store_managers')); }
    finally { await db.exec('RESET ROLE'); }
  }
  const audit=(await db.query('SELECT * FROM private.store_manager_events ORDER BY id')).rows;
  ok('audit covers automatic revoke',audit.some(r=>r.event==='employee_changed'));
  ok('audit covers account revoke',audit.some(r=>r.event==='account_deleted'));
  ok('audit covers ownership transfer',audit.some(r=>r.event==='ownership_transferred'));
  check('audit revisions never duplicate',(await db.query('SELECT count(*)::int n FROM (SELECT store_id,revision FROM private.store_manager_events GROUP BY store_id,revision HAVING count(*)>1) x')).rows[0].n,0);
  for (const table of ['store_managers','store_manager_events','store_owner_transfers']) {
    const a=(await db.query("SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass",['private.'+table])).rows[0];
    check(`${table} RLS enabled`,a.relrowsecurity,true);
    for (const role of ['anon','authenticated','service_role']) {
      check(`${role} has no private table write`,(await db.query("SELECT has_table_privilege($1,$2,'INSERT,UPDATE,DELETE') allowed",[role,'private.'+table])).rows[0].allowed,false);
    }
  }
  const funcs=(await db.query(`SELECT n.nspname,p.proname,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private')
    AND (p.proname LIKE '%store_manager%' OR p.proname IN ('is_store_owner','is_store_admin','get_my_store_access','transfer_store_ownership','guard_store_owner_change','guard_legacy_member_role'))`)).rows;
  for (const f of funcs) {
    ok(`${f.proname} fixes search_path`,f.proconfig?.some(c=>c==='search_path=pg_catalog, public, private, pg_temp'));
    check(`${f.proname} not anon executable`,f.anon,false);
  }
  await as(u.owner2,'UPDATE stores SET deleted_at=now() WHERE id=$1',[s.second]);
  check('deleted store manager fails closed',(await as(u.pt,'SELECT is_store_manager($1) a',[s.second])).rows[0].a,false);
  check('soft delete physically clears appointment',(await state(s.second)).member_id,null);
  await rejects('deleted store mutation denied','STORE_OWNER_REQUIRED',async()=>assign(u.owner2,null,(await state(s.second)).revision,s.second));
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[u.owner2]);
  await db.query('UPDATE stores SET deleted_at=NULL WHERE id=$1',[s.second]);
  check('store restoration does not appoint manager',(await as(u.pt,'SELECT is_store_manager($1) a',[s.second])).rows[0].a,false);
  // Newly created stores receive a durable zero revision without data backfill guesses.
  await db.query("INSERT INTO stores(id,owner_id,name,deleted_at) VALUES($1,$2,'QA-ROLE-new',NULL)",[id(99),u.owner2]);
  check('new store has state',(await state(id(99))).revision,0);
  await as(u.owner2,'DELETE FROM stores WHERE id=$1',[id(99)]);
  check('physical store deletion cleans state',await state(id(99)),undefined);
  // 재적용이 실제 지정자·revision·감사 이력을 보존하는지 검사한다.
  await assign(u.owner2,id(90),(await state(s.second)).revision,s.second);
  const before=await state(s.second); const eventsBefore=(await db.query('SELECT count(*)::int n FROM private.store_manager_events')).rows[0].n;
  await db.exec(sql);
  check('reapply preserves appointment',await state(s.second),before);
  check('reapply preserves audit',(await db.query('SELECT count(*)::int n FROM private.store_manager_events')).rows[0].n,eventsBefore);
  await assign(u.owner2,id(90),(await state(s.second)).revision,s.second);
  await as(u.owner2,'DELETE FROM stores WHERE id=$1',[s.second]);
  check('assigned store deletion cleans state',await state(s.second),undefined);
  check('assigned store deletion cleans audit',(await db.query('SELECT count(*)::int n FROM private.store_manager_events WHERE store_id=$1',[s.second])).rows[0].n,0);
  console.log(`Role model SQL validation passed (${checks} checks; PGlite single connection, no remote).`);
} finally { await db.close(); }
