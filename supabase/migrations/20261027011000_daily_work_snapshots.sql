BEGIN;
-- Day records are current revisions; every edit/review has an immutable audit snapshot.
-- Existing monthly records/submissions are not split, overwritten or deleted by this migration.
CREATE TABLE public.payroll_daily_work (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
 work_date date NOT NULL,
 worked_minutes integer NOT NULL CHECK(worked_minutes BETWEEN 0 AND 1440),
 applied_hourly_wage numeric(12,4) NOT NULL CHECK(applied_hourly_wage>0 AND applied_hourly_wage<100000000),
 gross numeric(12,0) NOT NULL CHECK(gross>=0),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 1000),
 status text NOT NULL CHECK(status IN ('pending','approved','rejected')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 review_note text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(employee_id,work_date),
 CHECK(gross=round(worked_minutes*applied_hourly_wage/60))
);
CREATE INDEX payroll_daily_work_store_date ON public.payroll_daily_work(store_id,work_date);
CREATE TABLE public.payroll_daily_work_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
 work_date date NOT NULL, old_record jsonb, new_record jsonb NOT NULL,
 changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_daily_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_daily_work_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_daily_work,public.payroll_daily_work_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.payroll_daily_work,public.payroll_daily_work_history TO authenticated;
CREATE POLICY daily_work_read ON public.payroll_daily_work FOR SELECT TO authenticated USING(public.can_read_employee(store_id,employee_id));
CREATE POLICY daily_work_history_read ON public.payroll_daily_work_history FOR SELECT TO authenticated USING(public.can_read_employee(store_id,employee_id));
ALTER TABLE public.payroll ADD COLUMN daily_work_snapshot jsonb;

CREATE FUNCTION public.audit_daily_work() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.payroll_daily_work_history(store_id,employee_id,work_date,old_record,new_record,changed_by)
 VALUES(NEW.store_id,NEW.employee_id,NEW.work_date,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW),auth.uid());
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_daily_work() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_daily_work AFTER INSERT OR UPDATE ON public.payroll_daily_work FOR EACH ROW EXECUTE FUNCTION public.audit_daily_work();

CREATE FUNCTION public.save_daily_work(p_employee_id uuid,p_work_date date,p_minutes integer,p_note text,p_revision integer DEFAULT NULL)
RETURNS public.payroll_daily_work LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.employees; old_row public.payroll_daily_work; saved public.payroll_daily_work; rate numeric; admin boolean;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=p_employee_id FOR UPDATE;
 admin:=public.is_store_admin(e.store_id);
 IF auth.uid() IS NULL OR e.id IS NULL OR NOT e.is_active OR e.employment_type<>'part_time'
 OR NOT public.is_store_member(e.store_id) OR (NOT admin AND e.user_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'DAILY_WORK_FORBIDDEN'; END IF;
 IF p_work_date IS NULL OR p_work_date>(now() AT TIME ZONE 'Asia/Seoul')::date OR e.joined_at IS NULL OR p_work_date<e.joined_at
 OR p_minutes IS NULL OR p_minutes NOT BETWEEN 0 AND 1440 OR length(btrim(coalesce(p_note,''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'DAILY_WORK_INVALID'; END IF;
 SELECT * INTO old_row FROM public.payroll_daily_work WHERE employee_id=e.id AND work_date=p_work_date FOR UPDATE;
 IF old_row.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'DAILY_WORK_CHANGED'; END IF;
 -- Existing date's rate is an immutable snapshot even when minutes are corrected.
 rate:=old_row.applied_hourly_wage;
 IF rate IS NULL THEN
   SELECT hourly_wage INTO rate FROM public.employee_wage_history WHERE employee_id=e.id AND store_id=e.store_id AND effective_date<=p_work_date
     ORDER BY effective_date DESC,created_at DESC,id DESC LIMIT 1;
   IF rate IS NULL THEN SELECT hourly_wage INTO rate FROM public.employee_wage_history WHERE employee_id=e.id AND store_id=e.store_id ORDER BY effective_date,created_at DESC,id DESC LIMIT 1; END IF;
   IF rate IS NULL AND NOT EXISTS(SELECT 1 FROM public.employee_wage_history WHERE employee_id=e.id AND store_id=e.store_id) THEN rate:=e.hourly_wage; END IF;
 END IF;
 IF rate IS NULL OR rate<=0 OR rate>=100000000 OR rate::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'DAILY_WORK_RATE_REQUIRED'; END IF;
 INSERT INTO public.payroll_daily_work(store_id,employee_id,work_date,worked_minutes,applied_hourly_wage,gross,note,status,revision,submitted_by,reviewed_by)
 VALUES(e.store_id,e.id,p_work_date,p_minutes,rate,round(p_minutes*rate/60),btrim(p_note),CASE WHEN admin THEN 'approved' ELSE 'pending' END,1,auth.uid(),CASE WHEN admin THEN auth.uid() ELSE NULL END)
 ON CONFLICT(employee_id,work_date) DO UPDATE SET worked_minutes=excluded.worked_minutes,gross=excluded.gross,note=excluded.note,status=excluded.status,
 revision=payroll_daily_work.revision+1,submitted_by=excluded.submitted_by,reviewed_by=excluded.reviewed_by,review_note=NULL,updated_at=now() RETURNING * INTO saved;
 UPDATE public.payroll SET is_settled=false,settled_at=NULL WHERE employee_id=e.id AND year_month=to_char(p_work_date,'YYYY-MM') AND is_settled;
 RETURN saved;
END $$;
CREATE FUNCTION public.review_daily_work(p_id uuid,p_revision integer,p_status text,p_note text DEFAULT '')
RETURNS public.payroll_daily_work LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target uuid; saved public.payroll_daily_work;
BEGIN
 SELECT employee_id INTO target FROM public.payroll_daily_work WHERE id=p_id;
 PERFORM 1 FROM public.employees WHERE id=target FOR UPDATE;
 SELECT * INTO saved FROM public.payroll_daily_work WHERE id=p_id FOR UPDATE;
 IF auth.uid() IS NULL OR saved.id IS NULL OR NOT public.is_store_admin(saved.store_id) THEN RAISE EXCEPTION 'DAILY_WORK_FORBIDDEN'; END IF;
 IF saved.revision IS DISTINCT FROM p_revision OR saved.status<>'pending' THEN RAISE EXCEPTION 'DAILY_WORK_CHANGED'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('approved','rejected') OR length(coalesce(p_note,''))>1000 OR (p_status='rejected' AND btrim(coalesce(p_note,''))='') THEN RAISE EXCEPTION 'DAILY_WORK_INVALID'; END IF;
 UPDATE public.payroll_daily_work SET status=p_status,review_note=btrim(coalesce(p_note,'')),reviewed_by=auth.uid(),revision=revision+1,updated_at=now() WHERE id=p_id RETURNING * INTO saved;
 UPDATE public.payroll SET is_settled=false,settled_at=NULL WHERE employee_id=saved.employee_id AND year_month=to_char(saved.work_date,'YYYY-MM') AND is_settled;
 RETURN saved;
END $$;

-- Validates the month's source revisions on both the RPC and direct payroll writes.
CREATE FUNCTION public.daily_work_month_snapshot(p_employee_id uuid,p_year_month text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'work_date',work_date,'worked_minutes',worked_minutes,'applied_hourly_wage',applied_hourly_wage,'gross',gross,'status',status) ORDER BY work_date),'[]'::jsonb)
 FROM public.payroll_daily_work WHERE employee_id=p_employee_id AND work_date>= (p_year_month||'-01')::date AND work_date<((p_year_month||'-01')::date+interval '1 month');
$$;
REVOKE ALL ON FUNCTION public.daily_work_month_snapshot(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.validate_daily_payroll_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expected jsonb; total_minutes integer; total_gross numeric;
BEGIN
 IF NEW.is_settled AND EXISTS(SELECT 1 FROM public.payroll_daily_work WHERE employee_id=NEW.employee_id AND to_char(work_date,'YYYY-MM')=NEW.year_month) AND NEW.daily_work_snapshot IS NULL THEN RAISE EXCEPTION 'DAILY_WORK_REVIEW_REQUIRED'; END IF;
 IF NEW.daily_work_snapshot IS NULL THEN
   IF TG_OP='UPDATE' AND OLD.daily_work_snapshot IS NOT NULL THEN RAISE EXCEPTION 'DAILY_PAYROLL_LEGACY_OVERWRITE'; END IF;
   RETURN NEW;
 END IF;
 -- Changing deductions or unsettled status must not reinterpret a historical source snapshot.
 IF TG_OP='UPDATE' AND NOT NEW.is_settled AND NEW.daily_work_snapshot=OLD.daily_work_snapshot AND NEW.gross=OLD.gross
 AND NEW.worked_minutes IS NOT DISTINCT FROM OLD.worked_minutes AND NEW.applied_hourly_wage IS NOT DISTINCT FROM OLD.applied_hourly_wage THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.employees WHERE id=NEW.employee_id FOR UPDATE;
 expected:=public.daily_work_month_snapshot(NEW.employee_id,NEW.year_month);
 IF expected='[]'::jsonb OR NEW.daily_work_snapshot IS DISTINCT FROM expected OR EXISTS(SELECT 1 FROM jsonb_array_elements(expected) x WHERE x->>'status'<>'approved') THEN RAISE EXCEPTION 'DAILY_WORK_REVIEW_REQUIRED'; END IF;
 SELECT sum((x->>'worked_minutes')::integer),sum((x->>'gross')::numeric) INTO total_minutes,total_gross FROM jsonb_array_elements(expected) x;
 IF NEW.worked_minutes IS DISTINCT FROM total_minutes OR NEW.gross IS DISTINCT FROM total_gross OR NEW.applied_hourly_wage IS NOT NULL OR NEW.work_submission_id IS NOT NULL THEN RAISE EXCEPTION 'DAILY_PAYROLL_TOTAL_MISMATCH'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_daily_payroll_snapshot() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_daily_payroll_snapshot BEFORE INSERT OR UPDATE ON public.payroll FOR EACH ROW EXECUTE FUNCTION public.validate_daily_payroll_snapshot();

CREATE FUNCTION public.apply_daily_payroll(p_employee_id uuid,p_year_month text,p_snapshot jsonb,p_calculated jsonb,p_revision integer DEFAULT NULL)
RETURNS public.payroll LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.employees; prior public.payroll; saved public.payroll; calc public.payroll; expected jsonb; minutes integer; amount numeric; deductions numeric;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=p_employee_id FOR UPDATE;
 IF auth.uid() IS NULL OR e.id IS NULL OR e.employment_type<>'part_time' OR NOT public.is_store_admin(e.store_id) THEN RAISE EXCEPTION 'DAILY_WORK_FORBIDDEN'; END IF;
 IF p_year_month IS NULL OR p_year_month !~ '^\d{4}-(0[1-9]|1[0-2])$' OR p_year_month>to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM') THEN RAISE EXCEPTION 'DAILY_WORK_INVALID'; END IF;
 SELECT * INTO prior FROM public.payroll WHERE employee_id=e.id AND year_month=p_year_month FOR UPDATE;
 IF prior.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'DAILY_PAYROLL_CHANGED'; END IF;
 expected:=public.daily_work_month_snapshot(e.id,p_year_month);
 IF expected='[]'::jsonb OR expected IS DISTINCT FROM p_snapshot OR EXISTS(SELECT 1 FROM jsonb_array_elements(expected) x WHERE x->>'status'<>'approved') THEN RAISE EXCEPTION 'DAILY_WORK_REVIEW_REQUIRED'; END IF;
 SELECT sum((x->>'worked_minutes')::integer),sum((x->>'gross')::numeric) INTO minutes,amount FROM jsonb_array_elements(expected) x;
 calc:=jsonb_populate_record(NULL::public.payroll,p_calculated);
 IF calc.gross IS DISTINCT FROM amount THEN RAISE EXCEPTION 'DAILY_PAYROLL_TOTAL_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(jsonb_build_object('taxable',calc.taxable_base,'np',calc.national_pension,'hi',calc.health_insurance,'lt',calc.long_term_care,'ei',calc.employment_insurance,'it',calc.income_tax,'ltax',calc.local_income_tax,'wh',calc.withholding_tax,'net',calc.net_pay)) x WHERE x.value IS NULL OR x.value::numeric<0 OR x.value::numeric>=1000000000000 OR x.value::numeric<>trunc(x.value::numeric) OR x.value IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'DAILY_PAYROLL_INVALID_DEDUCTIONS'; END IF;
 deductions:=calc.national_pension+calc.health_insurance+calc.long_term_care+calc.employment_insurance+calc.income_tax+calc.local_income_tax+calc.withholding_tax;
 IF calc.net_pay<>greatest(0,amount-deductions) THEN RAISE EXCEPTION 'DAILY_PAYROLL_INVALID_DEDUCTIONS'; END IF;
 INSERT INTO public.payroll(store_id,employee_id,year_month,gross,taxable_base,national_pension,health_insurance,long_term_care,employment_insurance,income_tax,local_income_tax,withholding_tax,net_pay,worked_minutes,applied_hourly_wage,work_note,work_source,work_submission_id,daily_work_snapshot,calculation_version)
 VALUES(e.store_id,e.id,p_year_month,amount,calc.taxable_base,calc.national_pension,calc.health_insurance,calc.long_term_care,calc.employment_insurance,calc.income_tax,calc.local_income_tax,calc.withholding_tax,calc.net_pay,minutes,NULL,'일별 근무시간 합계','manual',NULL,expected,calc.calculation_version)
 ON CONFLICT(employee_id,year_month) DO UPDATE SET gross=excluded.gross,taxable_base=excluded.taxable_base,national_pension=excluded.national_pension,health_insurance=excluded.health_insurance,long_term_care=excluded.long_term_care,employment_insurance=excluded.employment_insurance,income_tax=excluded.income_tax,local_income_tax=excluded.local_income_tax,withholding_tax=excluded.withholding_tax,net_pay=excluded.net_pay,worked_minutes=excluded.worked_minutes,applied_hourly_wage=NULL,work_note=excluded.work_note,work_source='manual',work_submission_id=NULL,daily_work_snapshot=excluded.daily_work_snapshot,calculation_version=excluded.calculation_version,is_settled=false,settled_at=NULL RETURNING * INTO saved;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.save_daily_work(uuid,date,integer,text,integer),public.review_daily_work(uuid,integer,text,text),public.apply_daily_payroll(uuid,text,jsonb,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_daily_work(uuid,date,integer,text,integer),public.review_daily_work(uuid,integer,text,text),public.apply_daily_payroll(uuid,text,jsonb,jsonb,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
