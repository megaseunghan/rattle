BEGIN;

ALTER TABLE public.payroll
  ADD COLUMN IF NOT EXISTS worked_minutes integer CHECK (worked_minutes BETWEEN 0 AND 44640),
  ADD COLUMN IF NOT EXISTS applied_hourly_wage numeric(12,4) CHECK (applied_hourly_wage > 0),
  ADD COLUMN IF NOT EXISTS work_note text,
  ADD COLUMN IF NOT EXISTS work_source text CHECK (work_source IN ('manual', 'legacy_attendance')),
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 과거 손익에서 사용한 월 범위([월초 마감, 다음 달 월초 마감], 한국 시각)를 유지한다.
-- 기존 출퇴근 테이블은 삭제하지 않는다. 이미 작성된 급여 금액은 덮어쓰지 않는다.
CREATE TEMP TABLE legacy_monthly_work ON COMMIT DROP AS
SELECT a.store_id, a.employee_id,
  to_char((a.timestamp AT TIME ZONE 'Asia/Seoul') - (coalesce(s.closing_time, '23:00'::time) - '00:00'::time), 'YYYY-MM') AS year_month,
  sum(coalesce(a.worked_minutes, 0))::integer AS worked_minutes,
  sum(coalesce(a.daily_wage, 0)) AS gross
FROM public.attendance a
JOIN public.stores s ON s.id = a.store_id
JOIN public.employees e ON e.id = a.employee_id AND e.store_id = a.store_id
WHERE a.type = 'clock_out' AND e.employment_type = 'part_time'
GROUP BY a.store_id, a.employee_id, year_month;

UPDATE public.payroll p SET worked_minutes = w.worked_minutes,
  work_source = 'legacy_attendance', work_note = '기존 출퇴근 기록에서 이전 (급여 금액 유지)'
FROM legacy_monthly_work w
WHERE p.employee_id = w.employee_id AND p.store_id = w.store_id
  AND p.year_month = w.year_month AND p.worked_minutes IS NULL;

INSERT INTO public.payroll (store_id, employee_id, year_month, gross, net_pay,
  worked_minutes, work_source, work_note)
SELECT store_id, employee_id, year_month, gross, gross, worked_minutes,
  'legacy_attendance', '기존 출퇴근 기록의 근무 분·세전 누적액 이전. 공제 내역 검토 필요'
FROM legacy_monthly_work
ON CONFLICT (employee_id, year_month) DO NOTHING;

CREATE TABLE public.payroll_work_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id uuid,
  year_month char(7) NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_record jsonb,
  new_record jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);
CREATE INDEX payroll_work_history_lookup ON public.payroll_work_history(store_id, employee_id, year_month, changed_at DESC);
ALTER TABLE public.payroll_work_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_work_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payroll_work_history TO authenticated;
CREATE POLICY payroll_work_history_read ON public.payroll_work_history
  FOR SELECT TO authenticated USING (public.is_store_member(store_id));

-- 최초 상태도 남겨 최초 수정 전/후 및 삭제·재작성까지 대조할 수 있게 한다.
INSERT INTO public.payroll_work_history (store_id, employee_id, year_month, operation, new_record)
SELECT store_id, employee_id, year_month, 'INSERT', to_jsonb(p) FROM public.payroll p;

CREATE FUNCTION public.prepare_payroll_work() RETURNS trigger
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
CREATE TRIGGER prepare_payroll_work BEFORE INSERT OR UPDATE ON public.payroll
  FOR EACH ROW EXECUTE FUNCTION public.prepare_payroll_work();

CREATE FUNCTION public.audit_payroll_work() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 매장 자체 삭제의 CASCADE에서는 지워지는 매장의 이력을 새로 만들지 않는다.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = OLD.store_id) THEN RETURN OLD; END IF;
  IF TG_OP <> 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = NEW.store_id) THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.payroll_work_history(store_id, employee_id, year_month, operation, old_record, changed_by)
      VALUES (OLD.store_id, OLD.employee_id, OLD.year_month, TG_OP, to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  INSERT INTO public.payroll_work_history(store_id, employee_id, year_month, operation, old_record, new_record, changed_by)
    VALUES (NEW.store_id, coalesce(NEW.employee_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.employee_id END), NEW.year_month, TG_OP,
      CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW), auth.uid());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_payroll_work() FROM PUBLIC;
CREATE TRIGGER audit_payroll_work AFTER INSERT OR UPDATE OR DELETE ON public.payroll
  FOR EACH ROW EXECUTE FUNCTION public.audit_payroll_work();

DROP POLICY IF EXISTS payroll_store_member ON public.payroll;
CREATE POLICY payroll_read ON public.payroll FOR SELECT TO authenticated USING (public.is_store_member(store_id));
CREATE POLICY payroll_insert ON public.payroll FOR INSERT TO authenticated WITH CHECK (
  public.is_store_member(store_id) AND EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = employee_id AND e.store_id = payroll.store_id AND (e.employment_type = 'part_time' OR public.is_store_admin(payroll.store_id)))
);
CREATE POLICY payroll_update ON public.payroll FOR UPDATE TO authenticated USING (
  public.is_store_member(store_id) AND EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = employee_id AND e.store_id = payroll.store_id AND (e.employment_type = 'part_time' OR public.is_store_admin(payroll.store_id)))
) WITH CHECK (public.is_store_member(store_id));
CREATE POLICY payroll_delete ON public.payroll FOR DELETE TO authenticated USING (public.is_store_admin(store_id));

COMMIT;
