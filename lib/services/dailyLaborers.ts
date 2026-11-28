import type { DailyLaborEntry, DailyLaborer, DailyLaborPayment, DailyLaborPaymentMethod } from '../../types';
import { supabase } from '../supabase';
import { UserFacingError } from '../utils/error';
import { invalidateCachedStore } from './cacheInvalidation';
import { koreanDate } from '../utils/regularWages';
import { dailyAssessedTax, dailyPaymentPay, employmentRateFor, premium, isIsoDate, isWeekend, isYearMonth, missingStandardMessage, PayrollStandardMissingError } from '../payroll';

const MAX_WAGE = 10_000_000;

export interface DailyLaborerInput {
  name: string;
  phone?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  weekday_wage?: number | null;
  weekend_wage?: number | null;
  memo?: string | null;
}

export interface DailyLaborEntryInput {
  laborer_id: string;
  work_date: string;
  is_weekend?: boolean;
  daily_wage: number;
  extra_pay?: number;
  memo?: string | null;
}

const CHANGED = '다른 곳에서 내용이 바뀌었어요. 다시 불러온 뒤 확인해 주세요.';
const UNKNOWN_RESULT = '저장됐는지 확인하지 못했어요. 다시 불러온 뒤 확인해 주세요.';
const PAID_BEFORE_WORK = '지급일은 고른 근무일 중 마지막 날 이후로 골라 주세요.';

function fail(error: { code?: string; message?: string }): never {
  if (error.code === '23505') throw new UserFacingError('그날 근무 기록이 이미 있어요. 기존 기록을 고쳐 주세요.');
  if (error.code === '42501') throw new UserFacingError('사장님이나 점장님만 일용근로자 기록을 관리할 수 있어요.');
  if (error.message?.includes('DAILY_LABOR_PAID_LOCKED')) throw new UserFacingError('지급 완료한 기록은 고치거나 지울 수 없어요. 먼저 지급 대기로 되돌려 주세요.');
  if (error.code === '40001' || error.message?.includes('DAILY_LABOR_PAYMENT_CHANGED')) throw new UserFacingError(CHANGED);
  if (error.message?.includes('DAILY_LABOR_PAID_BEFORE_WORK')) throw new UserFacingError(PAID_BEFORE_WORK);
  // 서버가 코드를 주지 않은 실패(연결 끊김·응답 유실·JSON 아닌 5xx)는 저장됐는지 알 수 없다. 실패로 단정하지 않는다.
  if (!error.code) throw new UserFacingError(UNKNOWN_RESULT);
  throw new UserFacingError('저장하지 못했어요. 입력값과 연결 상태를 확인하고 다시 시도해 주세요.');
}

function failRead(): never {
  throw new UserFacingError('일용근로자 기록을 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
}

function wage(value: number | null | undefined, label: string): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_WAGE) throw new UserFacingError(`${label}을 0원~1,000만 원 사이 정수로 입력해 주세요.`);
  return value;
}

function text(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length > max) throw new UserFacingError(`${max}자 이내로 입력해 주세요.`);
  return trimmed || null;
}

export function normalizeLaborer(input: DailyLaborerInput) {
  const name = input.name.trim();
  if (!name || name.length > 50) throw new UserFacingError('이름을 1~50자로 입력해 주세요.');
  return { name, phone: text(input.phone, 20), bank_name: text(input.bank_name, 30),
    account_number: text(input.account_number?.replace(/[\s-]/g, ''), 30),
    weekday_wage: wage(input.weekday_wage, '평일 일당'), weekend_wage: wage(input.weekend_wage, '주말 일당'), memo: text(input.memo, 500) };
}

function ratesFor(workDate: string) {
  try { return employmentRateFor(workDate.slice(0, 7)); }
  catch (error) {
    if (error instanceof PayrollStandardMissingError) throw new UserFacingError(missingStandardMessage(error));
    throw error;
  }
}

/** 근무 기록 행: 하루치 산출세액과 근무일 기준 고용보험. 기준이 없는 달은 막는다. 소득세는 지급할 때 정한다. */
export function calculateDailyLaborEntry(input: DailyLaborEntryInput) {
  if (!isIsoDate(input.work_date)) throw new UserFacingError('근무일을 확인해 주세요.');
  const daily = wage(input.daily_wage, '일당')!;
  const extra = wage(input.extra_pay ?? 0, '추가수당')!;
  const rates = ratesFor(input.work_date);
  const gross = daily + extra;
  return { laborer_id: input.laborer_id, work_date: input.work_date, is_weekend: input.is_weekend ?? isWeekend(input.work_date),
    daily_wage: daily, extra_pay: extra, day_income_tax: dailyAssessedTax(gross),
    employment_insurance: premium(gross, rates.rate), calculation_version: rates.version, memo: text(input.memo, 500) };
}

/** 지급 묶음 미리보기(같은 일용근로자의 미지급 기록). 소득세 1,000원 미만 미징수는 묶음 합계로 판단한다. */
export function previewDailyLaborPayment(entries: Pick<DailyLaborEntry, 'gross' | 'day_income_tax' | 'employment_insurance'>[]) {
  return dailyPaymentPay(entries);
}

/** 평일/주말 구분에 맞는 명단 기본 일당. 주말 일당이 없으면 평일 일당을 쓴다. */
export function kindDailyWage(laborer: Pick<DailyLaborer, 'weekday_wage' | 'weekend_wage'>, weekend: boolean): number | null {
  return weekend ? laborer.weekend_wage ?? laborer.weekday_wage : laborer.weekday_wage;
}

/** 명단의 기본 일당: 주말(토·일)이면 주말 일당, 없으면 평일 일당. 공휴일은 판단하지 않는다. */
export function defaultDailyWage(laborer: Pick<DailyLaborer, 'weekday_wage' | 'weekend_wage'>, date: string): number | null {
  return kindDailyWage(laborer, isWeekend(date));
}

/** 한 달 근무일이 이 날수 이상이면 국민연금·건강보험 가입 대상일 수 있다고 안내한다(판정은 하지 않는다). */
export const INSURANCE_NOTICE_DAYS = 8;

/** 같은 달 기록에서 근무일(같은 날 중복은 하루)이 기준 이상인 일용근로자 ID. */
export function laborersAtInsuranceDays(entries: Pick<DailyLaborEntry, 'laborer_id' | 'work_date'>[], days = INSURANCE_NOTICE_DAYS): Set<string> {
  const dates = new Map<string, Set<string>>();
  for (const entry of entries) dates.set(entry.laborer_id, new Set([...(dates.get(entry.laborer_id) ?? []), entry.work_date]));
  return new Set([...dates].filter(([, set]) => set.size >= days).map(([id]) => id));
}

/** 지급일로 고를 수 있는 날: 올바른 날짜이고 오늘(한국 날짜) 이후가 아니다. */
export function isPayableDate(paidOn: string, today: string = koreanDate()): boolean {
  return isIsoDate(paidOn) && paidOn <= today;
}

/** 고른 근무일 중 마지막 날. 지급일은 이날 이후여야 한다(일한 뒤에 준다). */
export function lastWorkDate(entries: readonly Pick<DailyLaborEntry, 'work_date'>[]): string | null {
  return entries.reduce<string | null>((last, e) => (last == null || e.work_date > last ? e.work_date : last), null);
}

/** 공제 입력 검사. 0원 이상 정수여야 하고 합계가 세전을 넘으면 안 된다. 문제가 없으면 null. */
export function deductionError(gross: number, deductions: DailyLaborDeductions): string | null {
  const amounts = [deductions.income_tax, deductions.local_income_tax, deductions.employment_insurance];
  if (amounts.some(v => !Number.isSafeInteger(v) || v < 0)) return '공제 금액을 0원 이상 정수로 입력해 주세요.';
  if (amounts.reduce((a, b) => a + b, 0) > gross) return '공제 합계가 세전 금액보다 커요. 금액을 확인해 주세요.';
  return null;
}

/** 쓰기가 끝난 뒤의 캐시 새로고침. 실패해도 이미 저장된 쓰기를 실패로 바꾸지 않는다. */
async function refreshAfterWrite(storeId: string): Promise<void> {
  try { await invalidateCachedStore(storeId); } catch { /* 화면이 다시 불러올 때 맞춰진다. */ }
}

export async function getDailyLaborers(storeId: string): Promise<DailyLaborer[]> {
  const { data, error } = await supabase.from('daily_laborers').select('*').eq('store_id', storeId).order('is_active', { ascending: false }).order('name');
  if (error) failRead();
  return (data ?? []) as DailyLaborer[];
}

export async function saveDailyLaborer(storeId: string, input: DailyLaborerInput, previous?: Pick<DailyLaborer, 'id' | 'revision'>): Promise<DailyLaborer> {
  const normalized = normalizeLaborer(input);
  // 계좌번호는 새로 입력했을 때만 보낸다(비우면 기존 암호화 값을 유지). 서버가 암호화하고 끝 4자리만 남긴다.
  const { account_number: accountNumber, ...rest } = normalized;
  const row = accountNumber ? normalized : previous ? rest : normalized;
  const query = previous
    ? supabase.from('daily_laborers').update(row).eq('id', previous.id).eq('store_id', storeId).eq('revision', previous.revision)
    : supabase.from('daily_laborers').insert({ ...row, store_id: storeId });
  const { data, error } = await query.select().maybeSingle();
  if (error) fail(error);
  if (!data) throw new UserFacingError('다른 곳에서 내용이 바뀌었어요. 다시 불러온 뒤 확인해 주세요.');
  await refreshAfterWrite(storeId);
  return data as DailyLaborer;
}

export async function setDailyLaborerActive(storeId: string, laborer: Pick<DailyLaborer, 'id' | 'revision'>, isActive: boolean): Promise<void> {
  const { data, error } = await supabase.from('daily_laborers').update({ is_active: isActive })
    .eq('id', laborer.id).eq('store_id', storeId).eq('revision', laborer.revision).select('id').maybeSingle();
  if (error) fail(error);
  if (!data) throw new UserFacingError('다른 곳에서 내용이 바뀌었어요. 다시 불러온 뒤 확인해 주세요.');
  await refreshAfterWrite(storeId);
}

function monthRange(yearMonth: string) {
  if (!isYearMonth(yearMonth)) throw new UserFacingError('대상 월을 확인해 주세요.');
  const [year, month] = yearMonth.split('-').map(Number);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  return { from: `${yearMonth}-01`, to: `${next}-01` };
}

export async function getDailyLaborEntries(storeId: string, yearMonth: string): Promise<DailyLaborEntry[]> {
  const { from, to } = monthRange(yearMonth);
  const { data, error } = await supabase.from('daily_labor_entries').select('*').eq('store_id', storeId)
    .gte('work_date', from).lt('work_date', to).order('work_date').order('created_at');
  if (error) failRead();
  return (data ?? []) as DailyLaborEntry[];
}

/** 이 달 기록에 연결된 지급 묶음(취소 포함하지 않음). */
export async function getDailyLaborPayments(storeId: string, paymentIds: string[]): Promise<DailyLaborPayment[]> {
  if (!paymentIds.length) return [];
  const { data, error } = await supabase.from('daily_labor_payments').select('*').eq('store_id', storeId)
    .in('id', [...new Set(paymentIds)]).is('canceled_at', null).order('paid_on');
  if (error) failRead();
  return (data ?? []) as DailyLaborPayment[];
}

/** 근무 기록 저장. 지급한 기록은 금액을 바꿀 수 없다(서버도 막는다). 금액이 그대로면 저장 당시 공제·계산 버전을 유지한다. */
export async function saveDailyLaborEntry(storeId: string, input: DailyLaborEntryInput, previous?: DailyLaborEntry): Promise<DailyLaborEntry> {
  const calculated = calculateDailyLaborEntry(input);
  const amountChanged = previous && (previous.daily_wage !== calculated.daily_wage || previous.extra_pay !== calculated.extra_pay);
  if (previous?.payment_id && amountChanged) throw new UserFacingError('지급한 기록은 금액을 고칠 수 없어요. 지급을 취소한 뒤 고쳐 주세요.');
  const row = previous && !amountChanged
    ? { ...calculated, day_income_tax: previous.day_income_tax, employment_insurance: previous.employment_insurance, calculation_version: previous.calculation_version }
    : calculated;
  const query = previous
    ? supabase.from('daily_labor_entries').update(row).eq('id', previous.id).eq('store_id', storeId).eq('revision', previous.revision)
    : supabase.from('daily_labor_entries').insert({ ...row, store_id: storeId });
  const { data, error } = await query.select().maybeSingle();
  if (error) fail(error);
  if (!data) throw new UserFacingError(CHANGED);
  await refreshAfterWrite(storeId);
  return data as DailyLaborEntry;
}

export interface DailyLaborDeductions { income_tax: number; local_income_tax: number; employment_insurance: number }

/** 지급 완료 기록 전 검사. 문제가 있으면 UserFacingError를 던지고, 예상 공제와 실제 공제를 돌려준다. */
function preparePayment(laborerId: string, entries: DailyLaborEntry[], paidOn: string, method: DailyLaborPaymentMethod, edited?: DailyLaborDeductions) {
  if (!isIsoDate(paidOn)) throw new UserFacingError('지급일을 확인해 주세요.');
  if (!isPayableDate(paidOn)) throw new UserFacingError('오늘 이후 날짜는 지급일로 고를 수 없어요.');
  if (method !== 'transfer' && method !== 'cash') throw new UserFacingError('지급 방법을 골라 주세요.');
  if (!entries.length || entries.some(e => e.laborer_id !== laborerId || e.payment_id)) throw new UserFacingError('지급 대기 기록을 골라 주세요.');
  if (paidOn < (lastWorkDate(entries) as string)) throw new UserFacingError(PAID_BEFORE_WORK);
  const pay = dailyPaymentPay(entries);
  const actual = edited ?? pay;
  const problem = deductionError(pay.gross, actual);
  if (problem) throw new UserFacingError(problem);
  return { pay, actual };
}

/**
 * 같은 일용근로자의 지급 대기 기록을 골라 '지급 완료'로 기록한다(앱은 송금하지 않는다).
 * 공제는 예상값(묶음 합계 기준 소득세)을 기본으로 하고, 사용자가 고친 값이 있으면 그 값을 그대로 저장한다.
 * 예상값은 따로 남긴다.
 */
export async function recordDailyLaborPayment(storeId: string, laborerId: string, entries: DailyLaborEntry[], paidOn: string,
  method: DailyLaborPaymentMethod, edited?: DailyLaborDeductions): Promise<string> {
  const { pay, actual } = preparePayment(laborerId, entries, paidOn, method, edited);
  return sendPayment(storeId, laborerId, entries, paidOn, method, pay, actual);
}

async function sendPayment(storeId: string, laborerId: string, entries: DailyLaborEntry[], paidOn: string, method: DailyLaborPaymentMethod,
  pay: DailyLaborDeductions, actual: DailyLaborDeductions): Promise<string> {
  const version = [...new Set(entries.map(e => e.calculation_version))].sort().join('+');
  const { data, error } = await supabase.rpc('record_daily_labor_payment', {
    p_store_id: storeId, p_laborer_id: laborerId, p_entry_ids: entries.map(e => e.id), p_paid_on: paidOn, p_payment_method: method,
    p_income_tax: actual.income_tax, p_local_income_tax: actual.local_income_tax, p_employment_insurance: actual.employment_insurance,
    p_estimated_income_tax: pay.income_tax, p_estimated_local_income_tax: pay.local_income_tax, p_estimated_employment_insurance: pay.employment_insurance,
    p_calculation_version: version,
  });
  if (error) fail(error);
  if (typeof data !== 'string') throw new UserFacingError(CHANGED);
  await refreshAfterWrite(storeId);
  return data;
}

export interface DailyLaborPaymentGroup { laborerId: string; entries: DailyLaborEntry[]; deductions?: DailyLaborDeductions }
export interface DailyLaborBatchResult { recorded: string[]; failed: { laborerId: string; message: string }[] }

/**
 * 여러 사람의 지급 대기 기록을 한 번에 '지급 완료'로 기록한다. 서버 함수는 한 사람씩 받으므로 사람마다 한 번씩 보낸다.
 * 입력 검사는 모두 먼저 끝낸 뒤 보낸다(검사 실패면 아무것도 저장하지 않는다). 보내다 실패한 사람은 failed로 돌려준다.
 */
export async function recordDailyLaborPayments(storeId: string, groups: DailyLaborPaymentGroup[], paidOn: string,
  method: DailyLaborPaymentMethod): Promise<DailyLaborBatchResult> {
  if (!groups.length) throw new UserFacingError('지급 대기 기록을 골라 주세요.');
  const prepared = groups.map(g => ({ ...g, ...preparePayment(g.laborerId, g.entries, paidOn, method, g.deductions) }));
  const result: DailyLaborBatchResult = { recorded: [], failed: [] };
  for (const g of prepared) {
    try {
      await sendPayment(storeId, g.laborerId, g.entries, paidOn, method, g.pay, g.actual);
      result.recorded.push(g.laborerId);
    } catch (e) {
      // 사용자용 오류가 아니면(연결 끊김 등) 저장됐는지 모른다. 바뀌었다고 단정하지 않고 다시 불러와 확인하게 한다.
      result.failed.push({ laborerId: g.laborerId, message: e instanceof UserFacingError ? e.message : UNKNOWN_RESULT });
    }
  }
  return result;
}

/** 지급 완료를 '지급 대기'로 되돌린다(기록은 canceled_at으로 남는다). */
export async function cancelDailyLaborPayment(storeId: string, paymentId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_daily_labor_payment', { p_store_id: storeId, p_payment_id: paymentId });
  if (error) fail(error);
  await refreshAfterWrite(storeId);
}

export async function deleteDailyLaborEntry(storeId: string, entry: Pick<DailyLaborEntry, 'id' | 'revision'>): Promise<void> {
  const { data, error } = await supabase.from('daily_labor_entries').delete()
    .eq('id', entry.id).eq('store_id', storeId).eq('revision', entry.revision).select('id').maybeSingle();
  if (error) fail(error);
  if (!data) throw new UserFacingError('다른 곳에서 내용이 바뀌었어요. 다시 불러온 뒤 확인해 주세요.');
  await refreshAfterWrite(storeId);
}

/** 월 합계: 세전, 지급 완료(묶음 실지급), 미지급 세전. */
export function dailyLaborTotals(entries: Pick<DailyLaborEntry, 'gross' | 'payment_id'>[], payments: Pick<DailyLaborPayment, 'id' | 'net_pay'>[] = []) {
  const paidIds = new Set(entries.flatMap(e => (e.payment_id ? [e.payment_id] : [])));
  return {
    gross: entries.reduce((sum, e) => sum + e.gross, 0),
    unpaidGross: entries.reduce((sum, e) => sum + (e.payment_id ? 0 : e.gross), 0),
    paidNet: payments.filter(p => paidIds.has(p.id)).reduce((sum, p) => sum + p.net_pay, 0),
  };
}
