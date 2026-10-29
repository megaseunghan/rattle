import { getAdminFinancialFallback } from './adminFinancialFallback';
import { supabase } from '../supabase';
import type { HomeFinancialSummary } from '../../types';
import { UserFacingError } from '../utils/error';

export async function getHomeFinancialSummary(storeId: string, yearMonth: string): Promise<HomeFinancialSummary> {
  const { data, error } = await supabase.rpc('get_home_financial_summary', { p_store_id: storeId, p_year_month: yearMonth });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new UserFacingError('매장 요약을 불러오지 못했어요. 다시 시도해주세요.');
  const keys = ['revenue', 'purchase_cost', 'labor_cost', 'fixed_expense', 'variable_expense', 'operating_profit'];
  if (row.year_month !== yearMonth || keys.some(key => row[key] == null || row[key] === '' || !Number.isFinite(Number(row[key])))) {
    throw new UserFacingError('매장 요약을 확인하지 못했어요. 다시 시도해주세요.');
  }
  const result = {
    yearMonth: row.year_month,
    revenue: Number(row.revenue),
    purchaseCost: Number(row.purchase_cost),
    laborCost: Number(row.labor_cost),
    fixedExpense: Number(row.fixed_expense),
    variableExpense: Number(row.variable_expense),
    operatingProfit: Number(row.operating_profit),
  };
  return result;
}

export interface StoreFinancialSummary extends HomeFinancialSummary { storeId: string }
/** One authorized server aggregation for unique stores and months. Missing rows are errors, never zero. */
export async function getFinancialSummaries(storeIds: string[], yearMonths: string[], requireAdmin = false): Promise<StoreFinancialSummary[]> {
  const ids = [...new Set(storeIds)];
  const months = [...new Set(yearMonths)];
  if (!ids.length || !months.length) return [];
  const { data, error } = await supabase.rpc('get_financial_summaries_v2', {
    p_store_ids: ids, p_year_months: months, p_require_admin: requireAdmin,
  });
  if (error) {
    // Only the absent v2 endpoint permits the authorized compatibility read.
    // Permission, network, and all other server errors remain errors.
    if (requireAdmin && error.code === 'PGRST202' && error.message?.includes('get_financial_summaries_v2')) {
      return getAdminFinancialFallback(ids, months);
    }
    throw error;
  }
  const keys = ['revenue', 'purchase_cost', 'labor_cost', 'fixed_expense', 'variable_expense', 'operating_profit'];
  if (!Array.isArray(data)) throw new UserFacingError('매장 요약을 불러오지 못했어요. 다시 시도해주세요.');
  const seen = new Set<string>();
  const rows = data.map((row: Record<string, unknown>) => {
    const id = String(row.store_id), month = String(row.year_month), key = `${id}:${month}`;
    const invalidAmount = keys.some(k => {
      if (['labor_cost', 'operating_profit'].includes(k) && row[k] === null) return false;
      return !['number', 'string'].includes(typeof row[k]) || row[k] === '' || !Number.isFinite(Number(row[k]));
    });
    const inconsistentCoverage = (row.labor_cost === null) !== (row.operating_profit === null);
    if (!ids.includes(id) || !months.includes(month) || seen.has(key) || invalidAmount || inconsistentCoverage) {
      throw new UserFacingError('매장 요약을 확인하지 못했어요. 다시 시도해주세요.');
    }
    seen.add(key);
    return { storeId: id, yearMonth: month, revenue: Number(row.revenue), purchaseCost: Number(row.purchase_cost),
      laborCost: row.labor_cost === null ? null : Number(row.labor_cost), fixedExpense: Number(row.fixed_expense), variableExpense: Number(row.variable_expense), operatingProfit: row.operating_profit === null ? null : Number(row.operating_profit) };
  });
  if (rows.length !== ids.length * months.length) throw new UserFacingError('일부 매장의 요약이 누락됐어요. 다시 시도해주세요.');
  return rows;
}
