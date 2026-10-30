BEGIN;
-- 직원 제출은 급여와 분리한다. 직원은 시급·공제·최종 급여를 변경할 수 없다.
CREATE TABLE public.payroll_work_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  year_month text NOT NULL CHECK (year_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  worked_minutes integer NOT NULL CHECK (worked_minutes >= 0),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 1000),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('pending','approved','rejected','superseded')),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  UNIQUE(employee_id, year_month, version)
);
ALTER TABLE public.payroll_work_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX payroll_submissions_store_month ON public.payroll_work_submissions(store_id, year_month, employee_id, version DESC);
GRANT SELECT ON public.payroll_work_submissions TO authenticated;
CREATE POLICY payroll_submissions_read ON public.payroll_work_submissions FOR SELECT TO authenticated USING (
  public.is_store_member(store_id) AND (public.is_store_admin(store_id) OR EXISTS (
    SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.store_id = payroll_work_submissions.store_id AND e.user_id = auth.uid()
  ))
);
ALTER TABLE public.payroll ADD COLUMN work_submission_id uuid REFERENCES public.payroll_work_submissions(id) ON DELETE RESTRICT;

CREATE FUNCTION public.submit_work_minutes(p_employee_id uuid, p_year_month text, p_minutes integer, p_note text, p_previous_id uuid DEFAULT NULL)
RETURNS public.payroll_work_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE emp public.employees; latest public.payroll_work_submissions; saved public.payroll_work_submissions; max_minutes integer;
BEGIN
  SELECT * INTO emp FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR emp.user_id IS DISTINCT FROM auth.uid() OR NOT emp.is_active
    OR emp.employment_type <> 'part_time' OR NOT public.is_store_member(emp.store_id) THEN
    RAISE EXCEPTION '연결된 본인 파트타이머 계정으로만 제출할 수 있습니다';
  END IF;
  IF p_year_month IS NULL OR p_year_month !~ '^\d{4}-(0[1-9]|1[0-2])$'
    OR p_year_month > to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') THEN RAISE EXCEPTION '대상 월을 확인해주세요'; END IF;
  max_minutes := extract(day FROM (p_year_month || '-01')::date + interval '1 month - 1 day')::integer * 1440;
  IF p_minutes IS NULL OR p_minutes < 0 OR p_minutes > max_minutes THEN RAISE EXCEPTION '총 근무 분을 확인해주세요'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION '입력 근거를 1~1000자로 작성해주세요'; END IF;
  SELECT * INTO latest FROM public.payroll_work_submissions WHERE employee_id = emp.id AND year_month = p_year_month ORDER BY version DESC LIMIT 1;
  IF latest.id IS DISTINCT FROM p_previous_id THEN RAISE EXCEPTION '제출 내역이 변경됐습니다. 새로고침해주세요'; END IF;
  IF latest.status = 'pending' THEN UPDATE public.payroll_work_submissions SET status = 'superseded' WHERE id = latest.id; END IF;
  INSERT INTO public.payroll_work_submissions(store_id,employee_id,year_month,worked_minutes,note,version,status,submitted_by)
    VALUES(emp.store_id,emp.id,p_year_month,p_minutes,btrim(p_note),coalesce(latest.version,0)+1,'pending',auth.uid()) RETURNING * INTO saved;
  -- 재제출된 시간은 승인 전까지 급여 금액에 반영하지 않는다. 기존 정산 확정만 해제한다.
  UPDATE public.payroll SET is_settled = false, settled_at = NULL WHERE employee_id = emp.id AND year_month = p_year_month AND is_settled;
  RETURN saved;
END;
$$;
CREATE FUNCTION public.review_work_minutes(p_submission_id uuid, p_status text, p_note text DEFAULT '')
RETURNS public.payroll_work_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved public.payroll_work_submissions; target_employee uuid;
BEGIN
  SELECT employee_id INTO target_employee FROM public.payroll_work_submissions WHERE id = p_submission_id;
  PERFORM 1 FROM public.employees WHERE id = target_employee FOR UPDATE;
  SELECT * INTO saved FROM public.payroll_work_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_store_admin(saved.store_id) THEN RAISE EXCEPTION '관리자만 확인할 수 있습니다'; END IF;
  IF saved.status <> 'pending' OR EXISTS (SELECT 1 FROM public.payroll_work_submissions s WHERE s.employee_id = saved.employee_id AND s.year_month = saved.year_month AND s.version > saved.version)
    THEN RAISE EXCEPTION '최신 제출 내역을 새로고침해주세요'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION '확인 상태를 선택해주세요'; END IF;
  IF length(coalesce(p_note,'')) > 1000 OR (p_status = 'rejected' AND length(btrim(coalesce(p_note,''))) = 0) THEN RAISE EXCEPTION '반려 사유를 1~1000자로 작성해주세요'; END IF;
  UPDATE public.payroll_work_submissions SET status=p_status,reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(coalesce(p_note,'')) WHERE id=saved.id RETURNING * INTO saved;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_work_minutes(uuid,text,integer,text,uuid), public.review_work_minutes(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_work_minutes(uuid,text,integer,text,uuid), public.review_work_minutes(uuid,text,text) TO authenticated;

-- 화면뿐 아니라 DB에서도 최종 급여 수정은 관리자만 허용한다.
DROP POLICY IF EXISTS payroll_store_member ON public.payroll;
DROP POLICY IF EXISTS payroll_insert ON public.payroll;
DROP POLICY IF EXISTS payroll_update ON public.payroll;
CREATE POLICY payroll_insert ON public.payroll FOR INSERT TO authenticated WITH CHECK (public.is_store_admin(store_id));
CREATE POLICY payroll_update ON public.payroll FOR UPDATE TO authenticated USING (public.is_store_admin(store_id)) WITH CHECK (public.is_store_admin(store_id));

CREATE FUNCTION public.validate_payroll_submission() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE latest public.payroll_work_submissions; must_check boolean := true;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    must_check := NEW.is_settled OR NEW.worked_minutes IS DISTINCT FROM OLD.worked_minutes
      OR NEW.work_submission_id IS DISTINCT FROM OLD.work_submission_id
      OR NEW.applied_hourly_wage IS DISTINCT FROM OLD.applied_hourly_wage OR NEW.gross IS DISTINCT FROM OLD.gross;
  END IF;
  IF NOT must_check THEN RETURN NEW; END IF;
  -- 제출·확인과 동일한 직원 행을 잠가 재제출과의 경합을 검사한다.
  PERFORM 1 FROM public.employees WHERE id = NEW.employee_id FOR UPDATE;
  SELECT * INTO latest FROM public.payroll_work_submissions WHERE employee_id = NEW.employee_id AND year_month = NEW.year_month ORDER BY version DESC LIMIT 1;
  IF latest.status = 'pending' THEN RAISE EXCEPTION '제출된 근무시간을 먼저 확인해주세요'; END IF;
  IF NEW.work_submission_id IS NOT NULL THEN
    IF latest.id IS DISTINCT FROM NEW.work_submission_id OR latest.status <> 'approved'
      OR latest.store_id <> NEW.store_id OR latest.worked_minutes IS DISTINCT FROM NEW.worked_minutes THEN
      RAISE EXCEPTION '승인된 최신 근무시간과 급여 입력을 다시 확인해주세요';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_payroll_submission BEFORE INSERT OR UPDATE ON public.payroll FOR EACH ROW EXECUTE FUNCTION public.validate_payroll_submission();

-- 기존 직원 테이블의 멤버 쓰기 권한으로 타인 계정을 본인에게 재연결하는 우회를 막는다.
CREATE FUNCTION public.guard_employee_account_link() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE deleted_account_unlink boolean := false;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.user_id IS NOT NULL) THEN
    IF NOT public.is_store_admin(NEW.store_id) THEN RAISE EXCEPTION '직원 계정 연결은 관리자만 변경할 수 있습니다'; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS NULL AND pg_trigger_depth() > 1 THEN
      SELECT NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) INTO deleted_account_unlink;
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT public.is_store_admin(OLD.store_id)
      AND NOT deleted_account_unlink THEN
      RAISE EXCEPTION '직원 계정 연결은 관리자만 변경할 수 있습니다';
    END IF;
    IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN RAISE EXCEPTION '직원의 매장은 변경할 수 없습니다'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_employee_account_link BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.guard_employee_account_link();
COMMIT;
