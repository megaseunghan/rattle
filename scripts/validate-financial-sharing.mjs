// Reduced local schema, no remote account/database writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const ids = Object.fromEntries(['owner','admin','regular','part','pending','unlinked','resigned','outsider','store'].map((key,i)=>[key,`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`]));
const as = async role => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[ids[role]??'']); await db.exec('SET ROLE authenticated'); };
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE stores(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,owner_id uuid,created_at timestamptz DEFAULT now());
 CREATE TABLE store_members(id uuid DEFAULT gen_random_uuid(),store_id uuid,user_id uuid,role text,status text);
 CREATE TABLE employees(id uuid DEFAULT gen_random_uuid(),store_id uuid,user_id uuid,is_active boolean,employment_type text);
 CREATE TABLE payroll(id uuid DEFAULT gen_random_uuid(),store_id uuid,employee_id uuid,gross numeric);
 CREATE TABLE notifications(store_id uuid,category text,message text);
 CREATE FUNCTION is_store_member(s uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid()) OR EXISTS(SELECT 1 FROM store_members WHERE store_id=s AND user_id=auth.uid() AND status='approved') $$;
 CREATE FUNCTION is_store_admin(s uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid()) OR EXISTS(SELECT 1 FROM store_members WHERE store_id=s AND user_id=auth.uid() AND status='approved' AND role='admin') $$;
 CREATE FUNCTION get_financial_summaries(p_store_ids uuid[],p_year_months text[],p_require_admin boolean DEFAULT false) RETURNS TABLE(store_id uuid,year_month text,revenue numeric,purchase_cost numeric,labor_cost numeric,fixed_expense numeric,variable_expense numeric,operating_profit numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN QUERY SELECT p_store_ids[1],p_year_months[1],100::numeric,10::numeric,20::numeric,5::numeric,5::numeric,60::numeric; END $$;
 CREATE FUNCTION get_financial_summaries_v2(p_store_ids uuid[],p_year_months text[],p_require_admin boolean DEFAULT false) RETURNS TABLE(store_id uuid,year_month text,revenue numeric,purchase_cost numeric,labor_cost numeric,fixed_expense numeric,variable_expense numeric,operating_profit numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN QUERY SELECT * FROM get_financial_summaries(p_store_ids,p_year_months,p_require_admin); END $$;
 INSERT INTO stores VALUES('${ids.store}','Existing','${ids.owner}',now());
 INSERT INTO payroll(store_id,gross) VALUES('${ids.store}',0),('${ids.store}',1234567);
 ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
 CREATE POLICY stores_read ON stores FOR SELECT USING(is_store_member(id));
 CREATE POLICY stores_update ON stores FOR UPDATE USING(is_store_admin(id));
 ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
 CREATE POLICY notification_read ON notifications FOR SELECT USING(is_store_member(store_id));
 INSERT INTO notifications VALUES('${ids.store}','sales','secret'),('${ids.store}','stock','safe');
 `);
 for (const t of ['toss_orders','toss_order_items','manual_sales','purchases','purchase_items','expenses']) {
  await db.exec(`CREATE TABLE ${t}(id uuid DEFAULT gen_random_uuid(),store_id uuid,amount numeric); ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
  CREATE POLICY member_access ON ${t} FOR ALL USING(is_store_member(store_id)) WITH CHECK(is_store_member(store_id));
  INSERT INTO ${t}(store_id,amount) VALUES('${ids.store}',1234);`);
 }
 for (const role of ['admin','regular','part','pending','unlinked','resigned']) {
  await db.query('INSERT INTO store_members(store_id,user_id,role,status) VALUES($1,$2,$3,$4)',[ids.store,ids[role],role==='admin'?'admin':'member',role==='pending'?'pending':'approved']);
  if (!['admin','unlinked'].includes(role)) await db.query('INSERT INTO employees(store_id,user_id,is_active,employment_type) VALUES($1,$2,$3,$4)',[ids.store,ids[role],role!=='resigned',role==='part'?'part_time':'regular']);
 }
 await db.exec(`
 CREATE FUNCTION get_pos_daily_summaries(p_store_id uuid,p_from timestamptz,p_to timestamptz) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN 42; END $$;
 CREATE FUNCTION get_pos_daily_items(p_store_id uuid,p_from timestamptz,p_to timestamptz) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN 42; END $$;
 CREATE FUNCTION upsert_pos_order_batch(p_store_id uuid,p_orders jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN 42; END $$;
 CREATE FUNCTION upsert_toss_order_with_items(p_store_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN 42; END $$;
 CREATE FUNCTION create_purchase_with_items(p_store_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN 42; END $$;
 CREATE FUNCTION update_purchase_item(p_item_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN 42; END $$;
 `);
 await db.exec(`
 INSERT INTO payroll(store_id,employee_id,gross) SELECT store_id,id,100 FROM employees WHERE user_id IN ('${ids.regular}','${ids.part}');
 ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;
 CREATE POLICY own_payroll ON payroll FOR SELECT USING(is_store_admin(store_id) OR (is_store_member(store_id) AND EXISTS(SELECT 1 FROM employees e WHERE e.id=payroll.employee_id AND e.store_id=payroll.store_id AND e.user_id=auth.uid())));
 `);
 const purchaseItemId = (await db.query('SELECT id FROM purchase_items')).rows[0].id;
 await db.exec(await readFile(new URL('../supabase/migrations/20261023123000_store_setup_financial_sharing.sql',import.meta.url),'utf8'));
 await db.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;');
 assert.equal((await db.query('SELECT financial_share_scope FROM stores')).rows[0].financial_share_scope,'all_staff');
 const oldPayroll = JSON.stringify((await db.query('SELECT * FROM payroll ORDER BY gross')).rows);
 let assertions=0;
 for (const scope of ['none','regular_only','all_staff']) {
  await as('owner'); await db.query('SELECT set_store_financial_sharing($1,$2)',[ids.store,scope]);
  for (const role of ['owner','admin','regular','part','pending','unlinked','resigned','outsider']) {
   await as(role);
   const allowed=['owner','admin'].includes(role)||(role==='regular'&&scope!=='none')||(role==='part'&&scope==='all_staff');
   assert.equal((await db.query('SELECT can_read_store_financials($1) value',[ids.store])).rows[0].value,allowed,`${scope}/${role}`);
   for (const table of ['toss_orders','toss_order_items','manual_sales','purchases','purchase_items','expenses']) {
    assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,allowed?1:0,`${scope}/${role}/${table}`);
   }
   const read = () => db.query('SELECT * FROM get_home_financial_summary($1,$2)',[ids.store,'2026-10']);
   if (allowed) assert.equal((await read()).rows.length,1); else await assert.rejects(read);
   for (const [sql, args] of [
    ['SELECT get_pos_daily_summaries($1,now(),now())',[ids.store]],
    ['SELECT get_pos_daily_items($1,now(),now())',[ids.store]],
    ["SELECT upsert_pos_order_batch($1,'[]'::jsonb)",[ids.store]],
    ['SELECT upsert_toss_order_with_items($1)',[ids.store]],
    ['SELECT create_purchase_with_items($1)',[ids.store]],
    ['SELECT update_purchase_item($1)',[purchaseItemId]],
   ]) {
    if (allowed) await db.query(sql,args); else await assert.rejects(()=>db.query(sql,args));
   }
   const financeNotifications = (await db.query("SELECT * FROM notifications WHERE category='sales'")).rows.length;
   assert.equal(financeNotifications,allowed?1:0);
   if (!['owner'].includes(role)) await assert.rejects(()=>db.query('SELECT set_store_financial_sharing($1,$2)',[ids.store,'all_staff']));
   assert.equal((await db.query('SELECT * FROM payroll')).rows.length,['owner','admin'].includes(role)?4:['regular','part'].includes(role)?1:0,`own payroll preserved for ${scope}/${role}`);
   assertions+=17;
  }
 }
 await as('admin'); await assert.rejects(()=>db.query("UPDATE stores SET financial_share_scope='none' WHERE id=$1",[ids.store]));
 await as('owner');
 const request='00000000-0000-0000-0000-000000000099';
 const create=()=>db.query('SELECT create_store_with_setup($1,$2,$3,$4) result',['New shop','later','none',request]);
 const first=(await create()).rows[0].result;
 assert.equal((await create()).rows[0].result.id,first.id);
 assert.equal(first.business_number,undefined); assert.equal(first.financial_share_scope,'none'); assert.equal(first.pos_setup_choice,'later');
 await db.exec('RESET ROLE');
 assert.equal((await db.query('SELECT count(*)::int n FROM stores')).rows[0].n,2);
 assert.equal(JSON.stringify((await db.query('SELECT * FROM payroll ORDER BY gross')).rows),oldPayroll);
 await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.owner}',false); SELECT set_store_financial_sharing('${ids.store}','none')`);
 await as('regular');
 await assert.rejects(()=>db.query('INSERT INTO manual_sales(store_id,amount) VALUES($1,999)',[ids.store]));
 await assert.rejects(()=>db.query('INSERT INTO manual_sales(store_id,amount) VALUES($1,999)',[first.id]));
 console.log(`Financial sharing SQL: ${assertions}+ role/policy/read/notification checks, owner protection, idempotent creation, raw write rejection and exact payroll preservation passed`);
} finally { await db.close(); }
