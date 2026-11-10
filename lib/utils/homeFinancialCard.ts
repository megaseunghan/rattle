import { koreanDate } from './regularWages';
export const HOME_METRICS = ['profit', 'revenue', 'purchase', 'labor', 'expense'] as const;
export type HomeMetric = typeof HOME_METRICS[number];
export type HomeValues = Record<HomeMetric, number | null>;
export interface FinancialDay { day: number; values: HomeValues; hasRecords: boolean }
export interface DailyAmount { date: string; revenue: number; purchase: number; cardRevenue?: number }
export interface HomeFinancialCardData {
  date: string; totals: HomeValues; current: FinancialDay[]; previous: FinancialDay[];
  /** null means the server contract does not establish whether records exist. */
  hasRecords: boolean | null;
}
export function financialPeriod(now = new Date()) {
  const date = koreanDate(now), month = date.slice(0, 7), day = Number(date.slice(8));
  const [year, m] = month.split('-').map(Number);
  const previous = new Date(Date.UTC(year, m - 2, 1));
  const previousMonth = previous.toISOString().slice(0, 7);
  return { date, month, previousMonth, day, previousDay: Math.min(day, new Date(Date.UTC(year, m - 1, 0)).getUTCDate()) };
}
export function buildCumulativeDays(month: string, through: number, rows: DailyAmount[]): FinancialDay[] {
  let revenue = 0, purchase = 0, hasRecords = false;
  return Array.from({ length: through }, (_, index) => {
    const day = index + 1, date = `${month}-${String(day).padStart(2, '0')}`;
    for (const row of rows.filter(row => row.date === date)) { revenue += row.revenue; purchase += row.purchase; hasRecords = true; }
    return { day, values: { revenue, purchase, labor: null, expense: null, profit: null }, hasRecords };
  });
}
export function won(value: number | null) { return value == null ? '확인 필요' : `${Math.round(value).toLocaleString('ko-KR')}원`; }
export function comparisonText(current: number | null, previous: number | null): string | null {
  if (current == null || previous == null) return null;
  const delta = current - previous;
  return `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(Math.round(delta)).toLocaleString('ko-KR')}원 (${previous === 0 ? '—' : `${delta > 0 ? '+' : ''}${(delta / Math.abs(previous) * 100).toFixed(1)}`}%)`;
}
export interface ChartPoint { x: number; y: number }
/** Headline totals stay cumulative; non-profit chart values show each day's change. */
export function financialChartDays(rows: FinancialDay[], metric: HomeMetric): FinancialDay[] {
  if (metric === 'profit') return rows;
  return rows.map((row, index) => {
    const value = row.values[metric];
    const previous = rows[index - 1];
    const baseline = row.day === 1 ? 0 : previous?.day === row.day - 1 ? previous.values[metric] : null;
    return { ...row, values: { ...row.values, [metric]: value == null || baseline == null ? null : value - baseline } };
  });
}
/** Soft trend only. Exact observed values are kept separately for the date readout. */
export function basisPath(points: ChartPoint[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let a = points[0], b = points[1];
  let path = `M ${a.x} ${a.y} L ${(5 * a.x + b.x) / 6} ${(5 * a.y + b.y) / 6}`;
  const segment = (c: ChartPoint) => { path += ` C ${(2 * a.x + b.x) / 3} ${(2 * a.y + b.y) / 3},${(a.x + 2 * b.x) / 3} ${(a.y + 2 * b.y) / 3},${(a.x + 4 * b.x + c.x) / 6} ${(a.y + 4 * b.y + c.y) / 6}`; a = b; b = c; };
  for (let i = 2; i < points.length; i++) segment(points[i]);
  segment(points[points.length - 1]);
  return `${path} L ${b.x} ${b.y}`;
}
/** Position a selection dot on the rendered soft trend, independently of the exact readout. */
export function trendPointAtX(path: string, x: number): ChartPoint | null {
  let start: ChartPoint | null = null;
  for (const command of path.match(/[MLC][^MLC]*/g) ?? []) {
    const numbers = (command.slice(1).match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (command[0] === 'M') { start = { x: numbers[0], y: numbers[1] }; continue; }
    if (!start) continue;
    const end = command[0] === 'C' ? { x: numbers[4], y: numbers[5] } : { x: numbers[0], y: numbers[1] };
    if (x >= start.x && x <= end.x) {
      if (command[0] === 'L') return { x, y: start.y + (end.y - start.y) * (x - start.x) / Math.max(0.00001, end.x - start.x) };
      const bezier = (a: number, b: number, c: number, d: number, t: number) => (1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d;
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) { const t = (lo + hi) / 2; if (bezier(start.x, numbers[0], numbers[2], end.x, t) < x) lo = t; else hi = t; }
      return { x, y: bezier(start.y, numbers[1], numbers[3], end.y, (lo + hi) / 2) };
    }
    start = end;
  }
  return start;
}
