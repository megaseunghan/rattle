BEGIN;

-- 20261016 마이그레이션을 이미 적용한 DB의 정산 조건도 갱신한다.
-- 기존 급여·근무 분·감사 이력은 수정하지 않는다.
CREATE OR REPLACE FUNCTION public.prepare_payroll_work() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE max_minutes integer; employee_type text;
BEGIN
  IF NEW.employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = NEW.employee_id AND e.store_id = NEW.store_id) THEN
    RAISE EXCEPTION '직원과 매장 정보가 일치하지 않습니다';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.employee_id IS NULL THEN RAISE EXCEPTION '직원을 선택해주세요'; END IF;
  SELECT e.employment_type INTO employee_type FROM public.employees e
    WHERE e.id = NEW.employee_id AND e.store_id = NEW.store_id;
  IF NEW.year_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION '대상 월을 확인해주세요'; END IF;
  max_minutes := extract(day FROM (NEW.year_month || '-01')::date + interval '1 month - 1 day')::integer * 1440;
  IF NEW.worked_minutes IS NOT NULL AND (NEW.worked_minutes < 0 OR NEW.worked_minutes > max_minutes) THEN
    RAISE EXCEPTION '해당 월의 총 시간을 초과할 수 없습니다';
  END IF;
  IF NEW.work_source = 'manual' AND (NEW.worked_minutes IS NULL OR length(trim(coalesce(NEW.work_note, ''))) = 0) THEN
    RAISE EXCEPTION '근무 분과 입력 근거를 작성해주세요';
  END IF;
  IF length(coalesce(NEW.work_note, '')) > 1000 THEN RAISE EXCEPTION '메모는 1000자 이내로 입력해주세요'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.year_month IS DISTINCT FROM OLD.year_month
      OR (NEW.employee_id IS DISTINCT FROM OLD.employee_id
        AND NOT (NEW.employee_id IS NULL AND pg_trigger_depth() > 1)) THEN
      RAISE EXCEPTION '급여의 매장, 직원, 월은 변경할 수 없습니다';
    END IF;
    NEW.revision := OLD.revision + 1;
    IF (to_jsonb(NEW) - ARRAY['revision','updated_at','updated_by','is_settled','settled_at','employee_id'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['revision','updated_at','updated_by','is_settled','settled_at','employee_id']) THEN
      NEW.is_settled := false;
      NEW.settled_at := NULL;
    END IF;
  ELSE
    NEW.revision := 0;
    NEW.is_settled := false;
    NEW.settled_at := NULL;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  IF NEW.is_settled AND employee_type = 'part_time' AND NEW.worked_minutes IS NULL
    AND (TG_OP = 'INSERT' OR NOT OLD.is_settled) THEN
    RAISE EXCEPTION '파트타이머의 총 근무 분을 입력한 뒤 정산해주세요';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_settled AND NOT OLD.is_settled AND NOT public.is_store_admin(NEW.store_id) THEN
    RAISE EXCEPTION '정산 확정은 관리자만 할 수 있습니다';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
