import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import type { DailyLaborEntry, DailyLaborer, DailyLaborPayment, DailyWorkRecord, Employee, Payroll } from '../../types';
import { supabase } from '../supabase';
import { readAllRows } from './readAllRows';
import { UserFacingError } from '../utils/error';
import { koreanDate } from '../utils/regularWages';

/** 세무사 전달용 급여·근무 기록 CSV. 계좌번호·주민번호는 넣지 않는다. 금액은 앱이 계산한 예상값이다. */
export interface PayrollExportSources {
  employees: Pick<Employee, 'id' | 'name' | 'employment_type' | 'income_type' | 'joined_at' | 'is_active'>[];
  payrolls: Payroll[];
  dailyWork: Pick<DailyWorkRecord, 'employee_id' | 'work_date' | 'worked_minutes' | 'applied_hourly_wage' | 'gross' | 'status'>[];
  laborers: Pick<DailyLaborer, 'id' | 'name'>[];
  laborEntries: DailyLaborEntry[];
  laborPayments: DailyLaborPayment[];
}

/** 쉼표·따옴표·줄바꿈을 감싸고, 표 계산기 수식으로 실행되지 않게 = + - @ 로 시작하는 글자는 앞에 '를 붙인다. */
export function csvCell(value: unknown): string {
  if (value == null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const HEADER = ['구분', '이름', '고용형태', '소득구분', '대상월', '근무일', '근무분', '적용시급', '세전', '과세기준', '국민연금', '건강보험', '장기요양', '고용보험',
  '소득세', '지방소득세', '3.3%원천징수', '실지급(예상)', '상태', '계산버전'];

export function buildPayrollCsv(sources: PayrollExportSources): string {
  const name = new Map(sources.employees.map(e => [e.id, e]));
  const laborer = new Map(sources.laborers.map(l => [l.id, l.name]));
  const type = (e?: { employment_type: string }) => (e ? (e.employment_type === 'regular' ? '정규직' : '파트타임') : '');
  const income = (e?: { income_type?: string | null }) => (e ? (e.income_type === 'freelancer' ? '프리랜서 3.3%' : '근로자') : '');
  const rows: unknown[][] = [];
  for (const p of [...sources.payrolls].sort((a, b) => a.year_month.localeCompare(b.year_month))) {
    const e = name.get(p.employee_id);
    rows.push(['월 급여', e?.name ?? '연결 해제된 직원', type(e), income(e), p.year_month, '', p.worked_minutes ?? '', p.applied_hourly_wage ?? '', p.gross,
      p.taxable_base, p.national_pension, p.health_insurance, p.long_term_care, p.employment_insurance, p.income_tax, p.local_income_tax, p.withholding_tax,
      p.net_pay, p.is_settled ? '정산완료' : '정산 전', p.calculation_version ?? '']);
  }
  for (const d of [...sources.dailyWork].sort((a, b) => a.work_date.localeCompare(b.work_date))) {
    const e = name.get(d.employee_id);
    rows.push(['파트 일별 근무', e?.name ?? '연결 해제된 직원', type(e), income(e), d.work_date.slice(0, 7), d.work_date, d.worked_minutes, d.applied_hourly_wage, d.gross,
      '', '', '', '', '', '', '', '', '', d.status === 'approved' ? '확인' : d.status === 'rejected' ? '반려' : '확인 대기', '']);
  }
  const paidOn = new Map(sources.laborPayments.map(p => [p.id, p.paid_on]));
  for (const l of [...sources.laborEntries].sort((a, b) => a.work_date.localeCompare(b.work_date))) {
    rows.push(['일용 근무', laborer.get(l.laborer_id) ?? '삭제된 명단', '일용', '일용근로자', l.work_date.slice(0, 7), l.work_date, '', '', l.gross,
      '', '', '', '', '', '', '', '', '', l.payment_id ? `지급 ${paidOn.get(l.payment_id) ?? ''}` : '미지급', l.calculation_version]);
  }
  // 소득세·지방소득세는 지급 묶음 합계로 정하므로 지급 행에 적는다(취소한 지급은 제외).
  for (const p of [...sources.laborPayments].filter(p => !p.canceled_at).sort((a, b) => a.paid_on.localeCompare(b.paid_on))) {
    rows.push(['일용 지급', laborer.get(p.laborer_id) ?? '삭제된 명단', '일용', '일용근로자', p.paid_on.slice(0, 7), p.paid_on, '', '', p.gross,
      '', '', '', '', p.employment_insurance, p.income_tax, p.local_income_tax, '', p.net_pay, '지급', p.calculation_version]);
  }
  // 엑셀에서 한글이 깨지지 않게 BOM을 붙인다.
  return '﻿' + [HEADER, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export async function loadPayrollExportSources(storeId: string): Promise<PayrollExportSources> {
  const page = <T>(table: string, columns: string) => readAllRows<T>((from, to) =>
    supabase.from(table).select(columns).eq('store_id', storeId).order('id').range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>);
  const [employees, payrolls, dailyWork, laborers, laborEntries, laborPayments] = await Promise.all([
    page<PayrollExportSources['employees'][number]>('employees', 'id, name, employment_type, income_type, joined_at, is_active'),
    page<Payroll>('payroll', '*'),
    page<PayrollExportSources['dailyWork'][number]>('payroll_daily_work', 'id, employee_id, work_date, worked_minutes, applied_hourly_wage, gross, status'),
    page<PayrollExportSources['laborers'][number]>('daily_laborers', 'id, name'),
    page<DailyLaborEntry>('daily_labor_entries', '*'),
    page<DailyLaborPayment>('daily_labor_payments', '*'),
  ]);
  return { employees, payrolls, dailyWork, laborers, laborEntries, laborPayments };
}

/** CSV 파일을 만들어 공유 시트를 연다. 공유를 닫아도 오류로 보지 않는다. */
export async function sharePayrollCsv(storeId: string, storeName: string): Promise<void> {
  let sources: PayrollExportSources;
  try { sources = await loadPayrollExportSources(storeId); }
  catch { throw new UserFacingError('기록을 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.'); }
  const csv = buildPayrollCsv(sources);
  // Android 공유 시트는 파일을 붙이지 못한다. 급여 원문이 대화에 남지 않게 본문 공유는 하지 않는다.
  if (Platform.OS !== 'ios') throw new UserFacingError('지금은 iPhone에서만 내려받을 수 있어요.');
  const safeName = storeName.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'store';
  const file = new File(Paths.cache, `rattle-payroll-${safeName}-${koreanDate()}.csv`);
  try {
    if (file.exists) file.delete();
    file.create();
    file.write(csv);
  } catch { throw new UserFacingError('파일을 만들지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.'); }
  // 급여가 담긴 파일을 캐시에 남기지 않는다.
  try { await Share.share({ url: file.uri, title: `${storeName} 급여·근무 기록` }); }
  finally { try { file.delete(); } catch { /* 이미 정리됐으면 무시 */ } }
}
