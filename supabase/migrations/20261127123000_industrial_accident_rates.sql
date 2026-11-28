-- 목적: 사업주 부담 4대보험 추정에 쓰는 요율 표.
--   1) 산재보험 업종 요율: 사장님이 「마저 채우기」 4대보험 묶음에서 매장 업종을 고르면 산재보험을 넣는다.
--      고르기 전에는 '산재보험 미포함'.
--   2) 고용안정·직업능력개발사업 사업주 요율(employer_insurance_rates): 손익 함수가 영업이익에서 빼는
--      사업주 부담을 계산할 때 쓴다(앱 lib/payroll/rates.ts employerExtra와 같은 값).
-- 값(2026-11-27 확인 범위, 세무사·노무사 확인 아님):
--   2026 도소매·음식·숙박업 1천분의 8, 출퇴근재해 1천분의 0.6(고용노동부고시 제2025-91호),
--   임금채권부담금 1만분의 9(고용노동부고시 제2025-100호): 고시 번호와 2차 자료로 확인했고 고시 원문은 아직 열람하지 못했다.
--   석면피해구제분담금은 확인하지 못해 비워 둔다(NULL = 미포함).
--   고용안정·직업능력개발 150인 미만 1만분의 25(고용보험 및 산재보험 보험료징수법 시행령 제12조).
--   2027년 요율은 12월 말 고시 후 새 파일로 추가한다.
-- 정책 문서: docs/intent/급여-계산-바로잡기.md 「계획 확인 중 추가 결정」, docs/intent/매장-만들기-마저-채우기.md.
-- 권한: 참조용 표라 로그인 사용자는 읽기만 한다. 쓰기는 마이그레이션으로만 한다.
-- 재실행: IF NOT EXISTS, ON CONFLICT DO NOTHING.
BEGIN;

CREATE TABLE IF NOT EXISTS public.industrial_accident_industries (
  code text PRIMARY KEY CHECK (code ~ '^[a-z_]{1,40}$'),
  name text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.industrial_accident_rates (
  industry_code text NOT NULL REFERENCES public.industrial_accident_industries(code),
  effective_from date NOT NULL,
  effective_to date NOT NULL,
  rate numeric(8,6) NOT NULL CHECK (rate >= 0 AND rate < 1),
  commute_rate numeric(8,6) NOT NULL CHECK (commute_rate >= 0 AND commute_rate < 1),
  wage_claim_rate numeric(8,6) NOT NULL CHECK (wage_claim_rate >= 0 AND wage_claim_rate < 1),
  asbestos_rate numeric(8,6) CHECK (asbestos_rate IS NULL OR (asbestos_rate >= 0 AND asbestos_rate < 1)),
  sources text[] NOT NULL,
  PRIMARY KEY (industry_code, effective_from),
  CHECK (effective_to >= effective_from)
);

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS industrial_accident_industry text
  REFERENCES public.industrial_accident_industries(code);

ALTER TABLE public.industrial_accident_industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industrial_accident_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.industrial_accident_industries, public.industrial_accident_rates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.industrial_accident_industries, public.industrial_accident_rates TO authenticated;
DROP POLICY IF EXISTS industrial_accident_industries_read ON public.industrial_accident_industries;
CREATE POLICY industrial_accident_industries_read ON public.industrial_accident_industries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS industrial_accident_rates_read ON public.industrial_accident_rates;
CREATE POLICY industrial_accident_rates_read ON public.industrial_accident_rates FOR SELECT TO authenticated USING (true);

INSERT INTO public.industrial_accident_industries(code, name, sort_order)
VALUES ('retail_food_lodging', '도소매·음식·숙박업', 1)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.industrial_accident_rates(industry_code, effective_from, effective_to, rate, commute_rate, wage_claim_rate, asbestos_rate, sources)
VALUES ('retail_food_lodging', '2026-01-01', '2026-12-31', 0.008, 0.0006, 0.0009, NULL,
  ARRAY['고용노동부고시 제2025-91호 https://www.moel.go.kr/info/lawinfo/instruction/view.do?bbs_seq=20251201757',
        '고용노동부고시 제2025-100호 https://www.moel.go.kr/info/lawinfo/instruction/view.do?bbs_seq=20260100011'])
ON CONFLICT (industry_code, effective_from) DO NOTHING;

-- 고용안정·직업능력개발사업 사업주 요율(150인 미만). 기간이 없는 달은 사업주 부담을 '확인 필요'로 둔다.
CREATE TABLE IF NOT EXISTS public.employer_insurance_rates (
  effective_from date PRIMARY KEY,
  effective_to date NOT NULL CHECK (effective_to >= effective_from),
  employment_stability_under_150 numeric(8,6) NOT NULL CHECK (employment_stability_under_150 >= 0 AND employment_stability_under_150 < 1),
  sources text[] NOT NULL
);
ALTER TABLE public.employer_insurance_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employer_insurance_rates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.employer_insurance_rates TO authenticated;
DROP POLICY IF EXISTS employer_insurance_rates_read ON public.employer_insurance_rates;
CREATE POLICY employer_insurance_rates_read ON public.employer_insurance_rates FOR SELECT TO authenticated USING (true);
INSERT INTO public.employer_insurance_rates(effective_from, effective_to, employment_stability_under_150, sources)
VALUES ('2019-01-01', '2026-12-31', 0.0025, ARRAY['고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행령 제12조(150인 미만 1만분의 25)'])
ON CONFLICT (effective_from) DO NOTHING;

COMMENT ON COLUMN public.stores.industrial_accident_industry IS '산재보험 사업종류. null이면 손익 사업주 부담에 산재보험 미포함';

NOTIFY pgrst, 'reload schema';
COMMIT;
