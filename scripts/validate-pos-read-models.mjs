// Local reduced schema only; does not connect to production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.RATTLE_PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const user='00000000-0000-0000-0000-000000000001', store='00000000-0000-0000-0000-000000000002', other='00000000-0000-0000-0000-000000000003';
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE stores(id uuid PRIMARY KEY,owner_id uuid,closing_time time);
 CREATE FUNCTION user_has_store_access(s uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM stores WHERE id=s AND owner_id=auth.uid()) $$;
 CREATE TABLE toss_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid,toss_order_id text UNIQUE,order_at timestamptz,total_amount numeric,status text,card_amount numeric,cash_amount numeric);
 CREATE TABLE toss_order_items(order_id uuid,store_id uuid,item_id text,item_name text,category_name text,quantity numeric,unit_price numeric,total_price numeric,option_choices jsonb);
 CREATE TABLE toss_catalog(store_id uuid,item_id text,category_name text,UNIQUE(store_id,item_id));
 INSERT INTO stores VALUES ('${store}','${user}','16:00'),('${other}','${user}','16:00');
 SELECT set_config('request.jwt.claim.sub','${user}',false);`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261023121000_pos_read_models.sql',import.meta.url),'utf8'));
 const batch = async (s,orders) => db.query('SELECT upsert_pos_order_batch($1,$2::jsonb)',[s,JSON.stringify(orders)]);
 const order=(id,at,amount=100)=>({orderId:id,orderAt:at,totalAmount:amount,cardAmount:amount,cashAmount:0,status:'COMPLETED',items:[{itemId:'i',itemName:'item',quantity:1,unitPrice:amount,totalPrice:amount}]});
 await batch(store,[order('1','2026-10-21T15:59:59+09:00'),order('2','2026-10-21T16:00:00+09:00',200)]);
 const summaries=await db.query('SELECT * FROM get_pos_daily_summaries($1,$2,$3)',[store,'2026-10-20T16:00:00+09:00','2026-10-21T16:00:00+09:00']);
 assert.equal(summaries.rows.length,1); assert.equal(Number(summaries.rows[0].total_amount),100);
 const items=await db.query('SELECT * FROM get_pos_daily_items($1,$2,$3)',[store,'2026-10-20T16:00:00+09:00','2026-10-22T16:00:00+09:00']);
 assert.equal(Number(items.rows[0].total_amount),300); assert.equal(Number(items.rows[0].quantity),2);
 await assert.rejects(()=>batch(other,[order('1','2026-10-21T16:00:00+09:00')]));
 assert.equal((await db.query("SELECT store_id FROM toss_orders WHERE toss_order_id='1'")).rows[0].store_id,store);
 await assert.rejects(()=>batch(store,[order('3','2026-10-21T16:00:00+09:00'),{...order('4','2026-10-21T16:00:00+09:00'),items:[{itemName:'bad'}]}]));
 assert.equal((await db.query("SELECT count(*)::int n FROM toss_orders WHERE toss_order_id='3'")).rows[0].n,0);
 await batch(store,[order('1','2026-10-21T15:59:59+09:00',150)]);
 assert.equal(Number((await db.query("SELECT sum(card_amount) n FROM toss_orders WHERE toss_order_id='1'")).rows[0].n),150);
 assert.equal((await db.query("SELECT count(*)::int n FROM toss_order_items WHERE order_id=(SELECT id FROM toss_orders WHERE toss_order_id='1')")).rows[0].n,1);
 await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");
 await assert.rejects(()=>db.query('SELECT * FROM get_pos_daily_summaries($1,$2,$3)',[store,'2026-10-20','2026-10-22']));
 await assert.rejects(()=>batch(store,[]));
 console.log('POS SQL: boundary, item totals, cross-store collision, transaction rollback, replacement/payment atomicity, anonymous rejection passed');
} finally { await db.close(); }
