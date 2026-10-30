import { readAllRows } from './readAllRows';
import { invalidateCachedStore } from './cacheInvalidation';
import { supabase } from '../supabase';
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

/** 매장당 하루 1건 — 같은 날짜로 다시 저장하면 그날 값을 덮어쓴다(upsert) */
export async function saveManualSale(input: {
  storeId: string;
  date: string;
  cashAmount: number;
  cardAmount: number;
  discountAmount: number;
  memo: string | null;
}): Promise<ManualSale> {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('manual_sales')
    .upsert(
      {
        store_id: input.storeId,
        date: input.date,
        cash_amount: input.cashAmount,
        card_amount: input.cardAmount,
        discount_amount: input.discountAmount,
        memo: input.memo,
        created_by: userData.user?.id ?? null,
      },
      { onConflict: 'store_id,date' },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  await invalidateCachedStore(input.storeId);
  return data as ManualSale;
}

export async function deleteManualSale(id: string): Promise<void> {
  const { error } = await supabase.from('manual_sales').delete().eq('id', id);
  if (error) throw new Error(error.message);
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
