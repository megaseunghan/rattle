/**
 * 홈 유도 훅 — 마저 채우기 시트·알림 카드·월급날 알림 (DESIGN.md 「홈 유도」, fill-v5).
 *
 * 계약 (S04 홈 작업자가 이대로 쓴다):
 *   const p = useStoreFillPrompt(storeId, { active });
 *   - loading / error: 마저 채우기 값을 읽는 중·실패. 실패하면 시트·알림을 띄우지 않는다(완료로 보지 않음).
 *   - values / filledCount / total(4) / isComplete: lib/utils/storeFill.ts 의 묶음 판정과 같다.
 *   - canEdit: 사장님만 true. 점장은 false(보기만).
 *   - shouldShowSheet: 사장님이고 다 채우기 전이며 오늘(KST) 처음 홈을 열었을 때 true.
 *       <FillPromptSheet visible={p.shouldShowSheet} ... /> 로 띄우고, 실제로 보였을 때 p.onSheetShown() 을 한 번 부른다
 *       (오늘 날짜를 기기에 남겨 같은 날 다시 띄우지 않는다).
 *   - onLater(): 시트를 닫는다. '채우기'를 눌렀을 때도 먼저 onLater()로 시트를 닫은 뒤 router.push('/store-fill') 한다
 *       (모달이 다음 화면 위에 남지 않게). active가 false가 되어도 시트를 닫는다.
 *   - alert: 다 채우기 전 관리자(사장·점장)에게 홈 알림 카드 묶음 맨 위에 둘 카드. 누르면 '/store-fill'. 다 채우면 null.
 *   - paydayAlert: 급여 날짜를 정한 매장의 관리자에게, 지급일 3일 전('d3')·당일('today')에만 생긴다. 앱 안 카드만.
 *       쉬는 날은 토·일만 본다(공휴일 자료 없음).
 *   - 관리자가 아니거나(직원·파트타이머·미리보기) storeId가 없으면 아무것도 읽지 않고 모두 null/false.
 *
 * '하루 한 번' 기록: AsyncStorage에는 마지막 매장 ID만 두므로 SecureStore에 rattle.fillPrompt.<storeId> = 'YYYY-MM-DD'.
 * 읽기에 실패하면 시트를 띄우되 같은 실행 중에는 메모리 기록으로 다시 띄우지 않는다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { secureStorageAdapter } from '../utils/secureStorageAdapter';
import { countStoreFill, STORE_FILL_GROUPS, type StoreFillValues } from '../utils/storeFill';
import { findPaydayAlert, kstToday, paydayAlertCopy } from '../utils/payday';
import { useStoreFill, useStoreFillRole } from '../components/store-fill/useStoreFill';

export interface StoreFillPrompt {
  loading: boolean;
  error: unknown;
  values: StoreFillValues | null;
  filledCount: number;
  total: 4;
  isComplete: boolean;
  canEdit: boolean;
  shouldShowSheet: boolean;
  onSheetShown(): void;
  onLater(): void;
  alert: { title: string; body: string } | null;
  paydayAlert: { kind: 'd3' | 'today'; title: string; body: string } | null;
}

const TOTAL = STORE_FILL_GROUPS.length as 4;
/** 같은 실행 안에서 이미 띄운 날(저장소 읽기·쓰기 실패 대비). storeId → 'YYYY-MM-DD' */
const shownInMemory = new Map<string, string>();

export function promptStorageKey(storeId: string): string {
  return `rattle.fillPrompt.${storeId}`;
}

/** 테스트 전용 */
export function resetFillPromptMemory(): void {
  shownInMemory.clear();
}

export function fillAlertCopy(filledCount: number): { title: string; body: string } {
  if (filledCount === 0) return { title: '급여 마감일·지급일을 정해 주세요', body: '정하면 월급날 3일 전과 당일에 알려 드릴게요' };
  return { title: '매장 정보를 마저 채워 주세요', body: `4개 중 ${filledCount}개 채웠어요` };
}

async function wasShownToday(storeId: string, today: string): Promise<boolean> {
  if (shownInMemory.get(storeId) === today) return true;
  try {
    const stored = await secureStorageAdapter.getItem(promptStorageKey(storeId));
    if (stored === today) shownInMemory.set(storeId, today);
    return stored === today;
  } catch {
    // 읽지 못하면 띄우되, 이번 실행에서는 다시 띄우지 않는다.
    shownInMemory.set(storeId, today);
    return false;
  }
}

export function useStoreFillPrompt(storeId: string | null, opts: { active: boolean }): StoreFillPrompt {
  const { isManager, canEdit } = useStoreFillRole(storeId);
  // 홈 탭이 보이지 않을 때는 조회를 시작하지 않는다(받아 둔 값은 캐시에 남는다).
  const { query } = useStoreFill(storeId, isManager && opts.active);
  const values = isManager ? query.data ?? null : null;
  const filledCount = values ? countStoreFill(values) : 0;
  const isComplete = !!values && filledCount === TOTAL;
  const today = kstToday();
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const sheetKey = storeId ? `${storeId}|${today}` : null;

  const wantsSheet = opts.active && canEdit && !!values && !isComplete && !!storeId;
  useEffect(() => {
    if (!wantsSheet || !storeId || !sheetKey) { setSheetFor(null); return; }
    let alive = true;
    void wasShownToday(storeId, today).then(shown => { if (alive && !shown) setSheetFor(sheetKey); });
    return () => { alive = false; };
  }, [wantsSheet, storeId, today, sheetKey]);

  const onSheetShown = useCallback(() => {
    if (!storeId) return;
    shownInMemory.set(storeId, today);
    void secureStorageAdapter.setItem(promptStorageKey(storeId), today).catch(() => { /* 메모리 기록으로 이번 실행은 막는다 */ });
  }, [storeId, today]);

  const onLater = useCallback(() => {
    if (storeId) shownInMemory.set(storeId, today);
    setSheetFor(null);
  }, [storeId, today]);

  const alert = useMemo(() => (values && !isComplete ? fillAlertCopy(filledCount) : null), [values, isComplete, filledCount]);
  const paydayAlert = useMemo(() => {
    if (!values || values.payroll_close_day == null || values.payday_day == null || values.payday_month_offset == null) return null;
    const found = findPaydayAlert({
      closeDay: values.payroll_close_day, monthOffset: values.payday_month_offset, payDay: values.payday_day,
      holidayRule: values.payday_holiday_rule ?? 'before',
    }, today);
    return found ? { kind: found.kind, ...paydayAlertCopy(found) } : null;
  }, [values, today]);

  return {
    loading: isManager && query.isLoading,
    error: isManager ? query.error ?? null : null,
    values, filledCount, total: TOTAL, isComplete, canEdit,
    shouldShowSheet: wantsSheet && sheetFor === sheetKey,
    onSheetShown, onLater, alert, paydayAlert,
  };
}
