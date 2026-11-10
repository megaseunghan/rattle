import { Colors } from '../../../constants/colors';
import type { HomeMetric } from '../../utils/homeFinancialCard';
export const financialTheme = {
  profit: Colors.action, revenue: Colors.action, purchase: Colors.action, labor: Colors.action, expense: Colors.action,
  prior: '#7A8592', positive: '#147653', negative: '#C52B38',
  chip: 'rgba(232,243,255,0.42)', skeleton: '#E1E7EF', surface: Colors.white,
};
export const metricLabels: Record<HomeMetric, string> = { profit: '영업이익', revenue: '매출', purchase: '매입', labor: '인건비', expense: '비용' };
