import type { ProfitLoss } from '../../types';
import { sumKnown } from '../utils/financialCoverage';
export type DashboardMetric = 'revenue' | 'purchase' | 'expense' | 'labor';
export interface BreakdownRow { label: string; amount: number | null }
export interface DashboardBreakdown { rows: BreakdownRow[]; suppliers?: BreakdownRow[]; total: number | null }
export const METRIC_LABELS: Record<DashboardMetric, string> = { revenue: '매출', purchase: '매입', expense: '비용', labor: '인건비' };
function group(rows: BreakdownRow[]): BreakdownRow[] {
  const buckets = new Map<string, (number | null)[]>();
  for (const row of rows) buckets.set(row.label, [...(buckets.get(row.label) ?? []), row.amount]);
  return [...buckets].map(([label, amounts]) => ({ label, amount: sumKnown(amounts) }))
    .sort((a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0) || a.label.localeCompare(b.label));
}
export function buildDashboardBreakdown(data: ProfitLoss[], metric: DashboardMetric): DashboardBreakdown {
  const rows: BreakdownRow[] = [], suppliers: BreakdownRow[] = [];
  for (const row of data) {
    if (metric === 'revenue') {
      rows.push({ label: '카드', amount: row.cardRevenue }, { label: '현금', amount: row.cashRevenue });
      const unknown = row.revenue - row.cardRevenue - row.cashRevenue;
      if (Math.abs(unknown) > 0.01) rows.push({ label: '결제수단 미분류', amount: unknown });
    } else if (metric === 'purchase') {
      const categories = Object.entries(row.purchaseByCategory).map(([label, amount]) => ({ label: label || '분류 미지정', amount: amount ?? 0 }));
      rows.push(...categories);
      const difference = row.purchaseCost - categories.reduce((sum, item) => sum + item.amount, 0);
      if (Math.abs(difference) > 0.01) rows.push({ label: '분류 확인 필요', amount: difference });
      const supplierRows = Object.entries(row.purchaseBySupplier ?? {}).map(([label, amount]) => ({ label, amount }));
      suppliers.push(...supplierRows);
      const supplierDifference = row.purchaseCost - supplierRows.reduce((sum, item) => sum + item.amount, 0);
      if (Math.abs(supplierDifference) > 0.01) suppliers.push({ label: '거래처 미분류', amount: supplierDifference });
    } else if (metric === 'expense') {
      rows.push({ label: '고정비', amount: row.fixedExpense }, { label: '마케팅', amount: row.marketingExpense },
        { label: '시설보수', amount: row.maintenanceExpense }, { label: '공과금', amount: row.utilitiesExpense }, { label: '카드 수수료(예상)', amount: row.cardFeeExpense });
    } else rows.push({ label: '직원 · 월급제', amount: row.regularGross }, { label: '파트타이머 · 시급제', amount: row.partTimeGross });
  }
  const totals = data.map(row => metric === 'revenue' ? row.revenue : metric === 'purchase' ? row.purchaseCost : metric === 'expense' ? row.fixedExpense + row.variableExpense : row.laborCost);
  return { rows: group(rows), ...(metric === 'purchase' ? { suppliers: group(suppliers) } : {}), total: sumKnown(totals) };
}
