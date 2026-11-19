-- RLS 정책의 auth.uid()/auth.jwt()/auth.role()/auth.email() 호출을 (SELECT auth.<fn>())로 감싼다.
-- 감싸면 Postgres가 쿼리당 한 번만 계산(initPlan)하고, 감싸지 않으면 행마다 다시 계산한다.
-- Supabase Performance Advisor 'auth_rls_initplan' 경고(24건) 대응이며 정책의 의미·대상 역할·명령은 바꾸지 않는다.
--
-- 여러 마이그레이션에 걸쳐 바뀐 정책을 손으로 다시 쓰지 않도록, 현재 DB에 걸린 정책 식(pg_policies)을
-- 읽어 해당 호출만 치환한다. 이미 감싼 호출('SELECT auth.uid()' 형태)은 건드리지 않으므로 다시 실행해도 안전하다.
-- 대상은 public 스키마 정책만이다.
DO $$
DECLARE
  p record;
  pattern constant text := '(?<!SELECT )auth\.(uid|jwt|role|email)\(\)';
  replacement constant text := '(SELECT auth.\1())';
  new_qual text;
  new_check text;
  stmt text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') ~ pattern OR coalesce(with_check, '') ~ pattern)
  LOOP
    new_qual := regexp_replace(p.qual, pattern, replacement, 'g');
    new_check := regexp_replace(p.with_check, pattern, replacement, 'g');
    stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF p.qual IS NOT NULL THEN stmt := stmt || format(' USING (%s)', new_qual); END IF;
    IF p.with_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', new_check); END IF;
    EXECUTE stmt;
  END LOOP;
END $$;
