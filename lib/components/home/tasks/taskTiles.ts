/**
 * 오늘 할 일 갤러리 타일 문구와 색(2026-11-27 확정 시안: 위 설명 12 / 아래 이름 15·600).
 * 체크리스트 진행은 실제 체크 기록만 쓰고, 불러오기 실패·미등록을 완료로 보이지 않는다.
 */
import type { HomeActionId } from '../../../../types';
import { Colors } from '../../../../constants/colors';

export type TileTone = 'blue' | 'green' | 'orange';
export interface ChecklistCount { total: number; done: number }
export type ChecklistState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; count: ChecklistCount };

export const TILE_TONES: Record<TileTone, { background: string; color: string }> = {
  blue: { background: Colors.bg, color: Colors.action },
  green: { background: Colors.sentiment.positiveBg, color: Colors.sentiment.positive },
  orange: { background: Colors.sentiment.neutralBg, color: Colors.sentiment.neutral },
};

interface TileCopy { title: string; description: string; tone: TileTone }
const COPY: Record<HomeActionId, TileCopy> = {
  open_check: { title: '오픈 준비 끝내기', description: '오픈 체크리스트', tone: 'blue' },
  close_check: { title: '마감 정리 끝내기', description: '마감 체크리스트', tone: 'blue' },
  weekday_check: { title: '요일별 체크하기', description: '오늘 요일 할 일 보고', tone: 'blue' },
  stock: { title: '재고 확인하기', description: '남은 양 보고', tone: 'orange' },
  stock_edit: { title: '재고 수량 고치기', description: '바뀐 수량 적고', tone: 'orange' },
  schedule: { title: '내 스케줄 보기', description: '이번 주 근무 보고', tone: 'blue' },
  purchase: { title: '매입 등록하기', description: '오늘 들어온 물건 적고', tone: 'green' },
  recipes: { title: '레시피 확인하기', description: '헷갈리는 메뉴 찾고', tone: 'blue' },
  sales: { title: '하루 매출 확인하기', description: '오늘 들어온 돈 보고', tone: 'blue' },
  expenses: { title: '비용 기록하기', description: '나간 돈 적고', tone: 'green' },
};

/** 체크리스트 타일의 위 설명. 체크 항목이 없으면 '추가'를, 실패면 '확인 필요'를 보인다. */
export function checklistDescription(state: ChecklistState): string {
  if (state.kind === 'loading') return '불러오는 중';
  if (state.kind === 'error') return '확인 필요';
  const { total, done } = state.count;
  if (!total) return '체크 항목을 추가해요';
  const left = total - done;
  return left > 0 ? `남은 ${left}개 챙기고` : `${total}개 모두 챙겼어요`;
}

export function tileCopy(id: HomeActionId, checklist?: ChecklistState): TileCopy {
  const base = COPY[id];
  if (!checklist || (id !== 'open_check' && id !== 'close_check')) return base;
  return { ...base, description: checklistDescription(checklist) };
}

export const TASK_PREVIEW_LIMIT = 4;
