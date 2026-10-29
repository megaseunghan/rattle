// 축약 스키마를 사용하는 로컬 DB 검증. 원격 서버에는 연결하지 않는다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE TABLE stores(id uuid PRIMARY KEY);
    CREATE TABLE store_members(id uuid PRIMARY KEY, store_id uuid, status text, applicant_name text, created_at timestamptz DEFAULT now());
    CREATE FUNCTION is_store_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION is_store_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.admin',true) = 'yes' $$;
    INSERT INTO stores VALUES ('00000000-0000-0000-0000-000000000001');
    INSERT INTO store_members VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001','pending','기존 신청자', now());
  `);
  await db.exec(await readFile('supabase/migrations/20260910_notifications.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261021_member_request_notifications.sql', 'utf8'));
  const rows = async () => (await db.query('SELECT * FROM notifications ORDER BY created_at')).rows;
  assert.equal((await rows()).length, 1, '기존 대기 신청 알림');
  await db.exec(`INSERT INTO store_members(id,store_id,status,applicant_name) VALUES
    ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','pending','신규 직원')`);
  assert.equal((await rows()).length, 2, '신규 신청 알림');
  await db.exec("UPDATE store_members SET status='pending'");
  assert.equal((await rows()).length, 2, '중복 방지');
  await db.exec("UPDATE store_members SET status='approved' WHERE applicant_name='신규 직원'");
  assert.equal((await rows()).find(n => n.message.includes('신규 직원')).is_read, true, '승인 후 읽음');
  await db.exec("UPDATE store_members SET status='rejected' WHERE applicant_name='기존 신청자'");
  assert.equal((await rows()).every(n => n.is_read), true, '거절 후 읽음');
  await db.exec("UPDATE store_members SET status='pending' WHERE applicant_name='기존 신청자'");
  assert.equal((await rows()).find(n => n.message.includes('기존 신청자')).is_read, false, '재신청 시 새 알림');
  assert.equal((await rows()).length, 2, '재신청 중복 방지');
  await db.exec('GRANT SELECT, UPDATE ON notifications TO authenticated; SET ROLE authenticated;');
  await db.exec("SET test.admin = 'no'");
  assert.equal((await rows()).length, 0, '직원에게 요청 숨김');
  await db.exec("SET test.admin = 'yes'");
  assert.equal((await rows()).length, 2, '관리자에게 요청 노출');
  await db.exec('UPDATE notifications SET is_read=true');
  assert.equal((await rows()).every(n => n.is_read), true, '관리자 읽음 처리');
  console.log('참여 요청 알림 SQL: 10개 검사 통과');
} finally { await db.close(); }
