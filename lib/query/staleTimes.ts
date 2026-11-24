/**
 * 재진입 캐시 시간표(사용자 확정 2026-11-24, docs/앱속도-재진입캐시-TanStack전략-2026-11-24.md 0장).
 * 이 시간 안에는 탭 재진입·스택 복귀에서 다시 요청하지 않는다. 내가 저장한 값은 서비스의
 * invalidateCachedStore가 바로 무효화하므로 시간과 무관하게 즉시 반영된다.
 */
const MINUTE = 60_000;

export const STALE_TIME = {
  /** 명시하지 않은 쿼리 */
  default: MINUTE,
  /** 설정류(홈 업무 구성·카테고리·매입 유형)·스케줄·매장 연결 정보·홈 직원 목록 */
  config: 30 * MINUTE,
  /** 매입·비용·수기 매출 */
  entry: 5 * MINUTE,
  /** 홈 손익 카드 이번 달 */
  financialCurrent: 5 * MINUTE,
  /** 홈 손익 카드 지난 달(마감된 달) */
  financialPast: 30 * MINUTE,
  /** 홈 상태(체크리스트·알림·재고 경고)·내 출퇴근(오늘) */
  homeStatus: MINUTE,
  /** 인건비·손익 상세(인건비 탭 직원 목록 포함) */
  moneyDetail: MINUTE,
  /** POS 오늘 매출(홈 카드·매출 탭 상단) */
  posToday: 5 * MINUTE,
  /** POS 월 일별 요약·품목 — 이번 달 범위 */
  posCurrent: 5 * MINUTE,
  /** POS 월 일별 요약·품목 — 지난 달(마감된 달) 범위 */
  posPast: 30 * MINUTE,
} as const;

const KST_OFFSET_MS = 9 * 60 * MINUTE;
const kstMonth = (time: number): string => new Date(time + KST_OFFSET_MS).toISOString().slice(0, 7);

/**
 * POS 범위 조회(월 일별 요약·품목)의 재사용 시간(docs/intent/POS매출-재사용시간.md).
 * 아직 끝나지 않은 범위나 이번 달(KST)에 시작한 범위는 이번 달 기준, 이미 끝난 지난 달 범위는 30분이다.
 * POS 자료는 앱 동기화로만 들어오고 내 기기의 동기화는 'pos' 무효화로 바로 반영된다.
 */
export function posRangeStaleTime(from: Date | string, to: Date | string, now: number = Date.now()): number {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (end > now || kstMonth(start) >= kstMonth(now)) return STALE_TIME.posCurrent;
  return STALE_TIME.posPast;
}
