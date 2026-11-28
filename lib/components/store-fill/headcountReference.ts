import { useQuery } from '@tanstack/react-query';
import { getAttendancePunches } from '../../services/attendance';
import { queryClient, queryKeys, useQueryScope } from '../../query';
import { STALE_TIME } from '../../query/staleTimes';
import { kstToday } from '../../utils/payday';

const WINDOW_DAYS = 30;
const PAGE_SIZE = 200;
/** 이보다 기록이 많으면 끝까지 읽지 않고 참고 숫자를 숨긴다. */
const MAX_PAGES = 10;

export interface PunchLike { employee_id: string; work_date: string }

/**
 * 하루 평균 인원 = 출퇴근 기록이 있는 (직원, 날짜) 수 ÷ 기록이 있는 날 수.
 * 상시근로자 수 산정(연인원 ÷ 가동일수)과 같은 방식의 참고값이다. 기록이 없으면 null.
 */
export function averageDailyHeadcount(rows: readonly PunchLike[]): number | null {
  const pairs = new Set(rows.map(row => `${row.employee_id}|${row.work_date}`));
  const days = new Set(rows.map(row => row.work_date));
  if (days.size === 0) return null;
  return Math.round((pairs.size / days.size) * 10) / 10;
}

export function headcountWindow(today: string): { fromDate: string; toDate: string } {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (WINDOW_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  return { fromDate: from, toDate: today };
}

async function readRecentHeadcount(storeId: string, today: string): Promise<number | null> {
  const window = headcountWindow(today);
  const rows: PunchLike[] = [];
  let offset: number | null = 0;
  for (let page = 0; offset != null; page += 1) {
    if (page >= MAX_PAGES) return null;
    const result = await getAttendancePunches({ storeId, ...window, offset, pageSize: PAGE_SIZE });
    if (result.status !== 'success') return null;
    rows.push(...result.data.rows);
    offset = result.data.nextOffset;
  }
  return averageDailyHeadcount(rows);
}

/** 최근 한 달 출퇴근 기록으로 센 하루 평균 인원. 못 구하면 null이라 화면에서 줄을 숨긴다. */
export function useHeadcountReference(storeId: string | null, enabled: boolean): number | null {
  const scope = useQueryScope();
  const today = kstToday();
  const query = useQuery({
    queryKey: queryKeys.store(scope, storeId ?? '', 'attendance-punches', 'headcount-reference', today),
    queryFn: () => readRecentHeadcount(storeId as string, today),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.config,
  }, queryClient);
  return query.data ?? null;
}
