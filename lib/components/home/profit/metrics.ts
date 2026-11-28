import type { HomeMetric } from '../../../utils/homeFinancialCard';
import type { ProfitPeriod } from './profitPeriods';

/** 확정 시안의 항목 순서: 영업이익·매출·매입·인건비·비용. */
export const PROFIT_METRICS: readonly HomeMetric[] = ['profit', 'revenue', 'purchase', 'labor', 'expense'];
export const METRIC_LABELS: Record<HomeMetric, string> = { profit: '영업이익', revenue: '매출', purchase: '매입', labor: '인건비', expense: '비용' };
export const PERIOD_LABELS: Record<ProfitPeriod, string> = { week: '주', month: '월', year: '연도' };
