import { HomeActionId, HomePhase, HomeWorkflow } from '../../types';
export const HOME_PHASES: { id: HomePhase; title: string }[] = [
  { id: 'open', title: '오픈 준비' }, { id: 'business', title: '영업 중' }, { id: 'close', title: '마감 정리' },
];
export const HOME_ACTIONS: { id: HomeActionId; label: string; financial?: boolean }[] = [
  { id: 'open_check', label: '오픈 체크리스트' }, { id: 'close_check', label: '마감 체크리스트' },
  { id: 'weekday_check', label: '요일별 체크' }, { id: 'stock', label: '재고 확인' },
  { id: 'stock_edit', label: '재고 수량 수정' }, { id: 'schedule', label: '내 스케줄' },
  { id: 'purchase', label: '매입 등록', financial: true }, { id: 'recipes', label: '레시피 확인', financial: true },
  { id: 'sales', label: '매출 확인', financial: true }, { id: 'expenses', label: '비용 기록', financial: true },
];
export const DEFAULT_HOME_WORKFLOW: HomeWorkflow = {
  open: ['open_check', 'stock', 'schedule'], business: ['stock_edit', 'purchase', 'recipes', 'weekday_check'], close: ['close_check', 'sales', 'expenses'],
};
export function isHomeWorkflow(value: unknown): value is HomeWorkflow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 3 && HOME_PHASES.every(({ id }) => {
    const list = record[id];
    return Array.isArray(list) && list.length <= HOME_ACTIONS.length && new Set(list).size === list.length && list.every(action => HOME_ACTIONS.some(a => a.id === action));
  });
}
