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
} as const;
