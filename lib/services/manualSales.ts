import { readAllRows } from './readAllRows';
import { invalidateCachedStore } from './cacheInvalidation';
import { supabase } from '../supabase';
import { UserFacingError } from '../utils/error';
import { ManualSale } from '../../types';

export async function getManualSalesByMonth(storeId: string, yearMonth: string): Promise<ManualSale[]> {
  const from = `${yearMonth}-01`;
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate();
  const to = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

  const data = await readAllRows((start, end) => supabase
    .from('manual_sales')
    .select('*')
    .eq('store_id', storeId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false }).order('id').range(start, end));
  return (data ?? []) as ManualSale[];
}

/** A missing row and a failed read are distinct. Callers must load before saving. */
export async function getManualSaleByDate(storeId: string, date: string): Promise<ManualSale | null> {
  const { data, error } = await supabase.from('manual_sales').select('*').eq('store_id', storeId).eq('date', date).maybeSingle();
  if (error) throw new Error(error.message);
  return data as ManualSale | null;
}

/** Insert new dates; update only the exact values the user reviewed. Never blind-upsert. */
export async function saveManualSale(input: {
  storeId: string;
  date: string;
  cashAmount: number;
  cardAmount: number;
  discountAmount: number;
  memo: string | null;
  expected: ManualSale | null;
}): Promise<ManualSale & { cacheRefreshFailed?: boolean }> {
  if (![input.cashAmount, input.cardAmount, input.discountAmount].every(n => Number.isSafeInteger(n) && n >= 0 && n < 1e12)) {
    throw new UserFacingError('매출과 할인액은 1조 원 미만의 0 이상 정수로 입력해주세요.');
  }
  const payload = { cash_amount: input.cashAmount, card_amount: input.cardAmount, discount_amount: input.discountAmount, memo: input.memo };
  let result;
  if (input.expected) {
    const old = input.expected;
    if (old.store_id !== input.storeId || old.date !== input.date) throw new UserFacingError('매장과 날짜를 다시 확인해주세요.');
    let query = supabase.from('manual_sales').update(payload).eq('id', old.id).eq('store_id', input.storeId).eq('date', input.date)
      .eq('cash_amount', old.cash_amount).eq('card_amount', old.card_amount).eq('discount_amount', old.discount_amount);
    query = old.memo === null ? query.is('memo', null) : query.eq('memo', old.memo);
    result = await query.select().maybeSingle();
  } else {
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) throw new UserFacingError('로그인을 다시 확인해주세요.');
    result = await supabase.from('manual_sales').insert({ ...payload, store_id: input.storeId, date: input.date, created_by: userData.user.id }).select().single();
  }
  if (result.error?.code === '23505' || (!result.error && !result.data)) {
    throw new UserFacingError('다른 곳에서 매출이 등록되거나 변경됐어요. 작성한 내용은 유지돼요. 저장된 값을 다시 불러와 확인해주세요.');
  }
  if (result.error) throw new Error(result.error.message);
  try { await invalidateCachedStore(input.storeId); }
  catch { return { ...result.data, cacheRefreshFailed: true } as ManualSale & { cacheRefreshFailed: true }; }
  return result.data as ManualSale;
}

export async function deleteManualSale(id: string): Promise<void> {
  const { data, error } = await supabase.from('manual_sales').delete().eq('id', id).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new UserFacingError('삭제 결과를 확인하지 못했어요. 다시 불러와 내역을 확인해주세요.');
  await invalidateCachedStore();
}

/** 손익계산서용 — 카드/현금 매출 합계 (할인액은 이미 입력된 금액에 반영된 순매출 기준) */
export async function getManualSalesTotals(
  storeId: string,
  yearMonth: string,
): Promise<{ cardRevenue: number; cashRevenue: number; total: number }> {
  const rows = await getManualSalesByMonth(storeId, yearMonth);
  const cardRevenue = rows.reduce((s, r) => s + Number(r.card_amount), 0);
  const cashRevenue = rows.reduce((s, r) => s + Number(r.cash_amount), 0);
  return { cardRevenue, cashRevenue, total: cardRevenue + cashRevenue };
}
