-- 직원 테이블
CREATE TABLE IF NOT EXISTS employees (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name                         TEXT NOT NULL,
  employment_type              TEXT NOT NULL DEFAULT 'regular'
                                 CHECK (employment_type IN ('regular', 'part_time')),
  base_salary                  NUMERIC(12, 0) NOT NULL DEFAULT 0,
  non_taxable                  NUMERIC(12, 0) NOT NULL DEFAULT 0,
  is_probation                 BOOLEAN NOT NULL DEFAULT false,
  probation_started_at         DATE,
  is_resigned_during_probation BOOLEAN NOT NULL DEFAULT false,
  weekly_hours                 INTEGER,        -- 파트타임: 주 시간 (15h 미만이면 3.3%)
  dependents                   INTEGER NOT NULL DEFAULT 1,
  is_active                    BOOLEAN NOT NULL DEFAULT true,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees_store_member" ON employees FOR ALL USING (
  store_id IN (
    SELECT id FROM stores WHERE owner_id = auth.uid()
    UNION
    SELECT store_id FROM store_members WHERE user_id = auth.uid() AND status = 'approved'
  )
);

-- 급여 명세 테이블
CREATE TABLE IF NOT EXISTS payroll (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id             UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year_month           CHAR(7) NOT NULL,  -- 'YYYY-MM'
  gross                NUMERIC(12, 0) NOT NULL DEFAULT 0,   -- 세전 총 지급액
  taxable_base         NUMERIC(12, 0) NOT NULL DEFAULT 0,   -- 과세기준액
  national_pension     NUMERIC(12, 0) NOT NULL DEFAULT 0,
  health_insurance     NUMERIC(12, 0) NOT NULL DEFAULT 0,
  long_term_care       NUMERIC(12, 0) NOT NULL DEFAULT 0,
  employment_insurance NUMERIC(12, 0) NOT NULL DEFAULT 0,
  income_tax           NUMERIC(12, 0) NOT NULL DEFAULT 0,
  local_income_tax     NUMERIC(12, 0) NOT NULL DEFAULT 0,
  withholding_tax      NUMERIC(12, 0) NOT NULL DEFAULT 0,   -- 3.3% 원천징수
  net_pay              NUMERIC(12, 0) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, year_month)
);

ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_store_member" ON payroll FOR ALL USING (
  store_id IN (
    SELECT id FROM stores WHERE owner_id = auth.uid()
    UNION
    SELECT store_id FROM store_members WHERE user_id = auth.uid() AND status = 'approved'
  )
);

-- 소득세 간이세액표 (2026년 기준, 월 급여 구간별)
-- dep_1 ~ dep_7: 부양가족 1인 ~ 7인 이상 소득세(원)
CREATE TABLE IF NOT EXISTS income_tax_table (
  year        INTEGER NOT NULL,
  salary_from NUMERIC(12, 0) NOT NULL,
  salary_to   NUMERIC(12, 0) NOT NULL,
  dep_1       INTEGER NOT NULL DEFAULT 0,
  dep_2       INTEGER NOT NULL DEFAULT 0,
  dep_3       INTEGER NOT NULL DEFAULT 0,
  dep_4       INTEGER NOT NULL DEFAULT 0,
  dep_5       INTEGER NOT NULL DEFAULT 0,
  dep_6       INTEGER NOT NULL DEFAULT 0,
  dep_7       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (year, salary_from)
);

-- 2026년 근로소득 간이세액표 주요 구간 (국세청 기준)
-- 1,060,000원 이하: 전 구간 0원
INSERT INTO income_tax_table (year, salary_from, salary_to, dep_1, dep_2, dep_3, dep_4, dep_5, dep_6, dep_7) VALUES
  (2026,       0,  1060000,     0,     0,     0,     0,     0,     0,     0),
  (2026, 1060000,  1100000, 10360,     0,     0,     0,     0,     0,     0),
  (2026, 1100000,  1150000, 15390,     0,     0,     0,     0,     0,     0),
  (2026, 1150000,  1200000, 20420,     0,     0,     0,     0,     0,     0),
  (2026, 1200000,  1250000, 25450,     0,     0,     0,     0,     0,     0),
  (2026, 1250000,  1300000, 30490,     0,     0,     0,     0,     0,     0),
  (2026, 1300000,  1350000, 35520,     0,     0,     0,     0,     0,     0),
  (2026, 1350000,  1400000, 40550,     0,     0,     0,     0,     0,     0),
  (2026, 1400000,  1450000, 45580,     0,     0,     0,     0,     0,     0),
  (2026, 1450000,  1500000, 50620,     0,     0,     0,     0,     0,     0),
  (2026, 1500000,  1600000, 60680, 10000,     0,     0,     0,     0,     0),
  (2026, 1600000,  1700000, 75740, 20050,     0,     0,     0,     0,     0),
  (2026, 1700000,  1800000, 90810, 35110,     0,     0,     0,     0,     0),
  (2026, 1800000,  1900000,105870, 50170,     0,     0,     0,     0,     0),
  (2026, 1900000,  2000000,120940, 65240,     0,     0,     0,     0,     0),
  (2026, 2000000,  2100000,136000, 80300, 24600,     0,     0,     0,     0),
  (2026, 2100000,  2200000,151060, 95360, 39660,     0,     0,     0,     0),
  (2026, 2200000,  2300000,166130,110430, 54730,     0,     0,     0,     0),
  (2026, 2300000,  2400000,181190,125490, 69790,     0,     0,     0,     0),
  (2026, 2400000,  2500000,196250,140550, 84850, 29160,     0,     0,     0),
  (2026, 2500000,  2600000,211320,155620, 99920, 44220,     0,     0,     0),
  (2026, 2600000,  2700000,226380,170680,114980, 59280,     0,     0,     0),
  (2026, 2700000,  2800000,241440,185740,130040, 74340,     0,     0,     0),
  (2026, 2800000,  2900000,256510,200810,145110, 89410, 33710,     0,     0),
  (2026, 2900000,  3000000,271570,215870,160170,104470, 48770,     0,     0),
  (2026, 3000000,  3200000,294670,238960,183260,127560, 71860, 16160,     0),
  (2026, 3200000,  3400000,330750,275040,219340,163640,107940, 52240,     0),
  (2026, 3400000,  3600000,366840,311130,255430,199730,144030, 88330, 32630),
  (2026, 3600000,  3800000,402930,347220,291520,235820,180120,124420, 68720),
  (2026, 3800000,  4000000,439010,383300,327600,271900,216200,160500,104800),
  (2026, 4000000,  4200000,490640,426640,370940,315240,259540,203840,148140),
  (2026, 4200000,  4400000,541640,477640,421940,366240,310540,254840,199140),
  (2026, 4400000,  4600000,600580,530330,474630,418930,363230,307530,251830),
  (2026, 4600000,  4800000,661260,583030,527330,471630,415930,360230,304530),
  (2026, 4800000,  5000000,721940,635720,580020,524320,468620,412920,357220),
  (2026, 5000000,  5500000,813980,718670,663820,608120,552420,496720,441020),
  (2026, 5500000,  6000000,938600,838340,779220,723520,667820,612120,556420),
  (2026, 6000000,  6500000,1067780,962830,903710,848010,792310,736610,680910),
  (2026, 6500000,  7000000,1203720,1093820,1034700,979000,923300,867600,811900),
  (2026, 7000000,  8000000,1426350,1311020,1251900,1196200,1140500,1084800,1029100),
  (2026, 8000000,  9000000,1748230,1623790,1559180,1498010,1442310,1386610,1330910),
  (2026, 9000000, 10000000,2115080,1982290,1912380,1846210,1785010,1729310,1673610),
  (2026,10000000, 12000000,2669020,2530670,2455390,2384930,2318760,2257560,2201860),
  (2026,12000000, 14000000,3481380,3337940,3259760,3185070,3113510,3046520,2985320),
  (2026,14000000, 16000000,4446660,4298350,4215840,4137250,4062440,3991720,3925290),
  (2026,16000000, 20000000,5843430,5690340,5604690,5522530,5444040,5369100,5297610),
  (2026,20000000, 99999999,9247830,9090500,9001890,8916810,8835160,8756950,8682240)
ON CONFLICT (year, salary_from) DO NOTHING;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_employees_store    ON employees (store_id, is_active);
CREATE INDEX IF NOT EXISTS idx_payroll_store_month ON payroll (store_id, year_month);
CREATE INDEX IF NOT EXISTS idx_payroll_employee    ON payroll (employee_id, year_month);

-- income_tax_table: 공개 데이터이므로 authenticated 사용자 읽기 허용
ALTER TABLE income_tax_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "income_tax_read_all" ON income_tax_table FOR SELECT TO authenticated USING (true);
