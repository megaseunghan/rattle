import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Radius, Spacing, Type } from '../../constants/designTokens';
import { ErrorMessage } from './ErrorMessage';
import { Skeleton, SkeletonGroup } from './skeleton';

export interface AttendanceWorkIssueItem { id: string; employeeId: string; employeeName: string; workDate: string; reason: string; retryPunchId?: string | null; retryUnknown?: boolean }
export function attendanceWorkFailureReason(code: string | null) {
  return code === 'ATTENDANCE_CHECKOUT_MISSING' ? '퇴근 기록이 없어요. 출퇴근 기록을 확인해주세요' : code === 'DAILY_WORK_RATE_REQUIRED' ? '시급을 등록해주세요' : '인건비에 반영하지 못했어요. 급여 조건을 확인해주세요';
}
/** Mounted only in the existing owner/manager payroll screen. No employee retry flow. */
export function AttendanceWorkIssuesNotice({ rows, loading, error, onReload, onEmployee, hasMore = false, onMore, limitReached = false, onRetry, retryingId = '', retryMessage = '' }: {
  rows: AttendanceWorkIssueItem[]; loading: boolean; error: string; onReload: () => void; onEmployee: (id: string) => void;
  hasMore?: boolean; onMore?: () => void;
  limitReached?: boolean; onRetry?: (id: string) => void; retryingId?: string; retryMessage?: string;
}) {
  if (!loading && !error && rows.length === 0) return null;
  return <View style={s.card}>
    <Text style={s.title}>확인 필요</Text>
    {loading ? <SkeletonGroup label="확인 필요 근무 불러오는 중" style={s.skeleton}>
      {[0, 1].map(i => <View key={i} style={s.row}><Skeleton width="52%" height={14} /><Skeleton width="72%" height={12} radius={6} /></View>)}
    </SkeletonGroup> : error ? <ErrorMessage message={error} onRetry={onReload} /> : rows.map(row => {
      const [, month, day] = row.workDate.split('-');
      return <View key={row.id} style={s.row}><Pressable accessibilityRole="button" accessibilityLabel={`${row.employeeName}님 직원 정보 보기`} onPress={() => onEmployee(row.employeeId)} style={s.row}>
        <Text style={s.name}>{row.employeeName}님 · {Number(month)}월 {Number(day)}일</Text>
        <Text style={s.body}>{row.reason}</Text>
      </Pressable>
        {row.retryPunchId ? <Pressable accessibilityRole="button" accessibilityLabel={`${row.employeeName}님 ${row.retryUnknown ? '반영 상태 확인하기' : '인건비 다시 반영하기'}`} disabled={!!retryingId} onPress={() => onRetry?.(row.id)} style={s.row}>
          <Text style={s.body}>{retryingId === row.id ? '반영하고 있어요' : row.retryUnknown ? '반영 상태 확인하기' : '인건비 다시 반영하기'}</Text>
        </Pressable> : <Text style={s.body}>{row.reason.startsWith('퇴근 기록이 없어요') ? '출퇴근 기록에서 정정해주세요' : '다시 반영하려면 퇴근 원본을 확인해주세요'}</Text>}
      </View>;
    })}
    {!!retryMessage && <Text accessibilityLiveRegion="polite" style={s.body}>{retryMessage}</Text>}
    {limitReached && <Text style={s.body}>최대 1,000건까지만 보여드려요. 표시되지 않은 근무가 있을 수 있어요</Text>}
    {!error && <><Text style={s.body}>시급을 수정했다면 새로고침해주세요</Text><Pressable accessibilityRole="button" disabled={loading || !!retryingId} style={s.row} onPress={onReload}><Text style={s.body}>새로고침</Text></Pressable></>}
    {hasMore && !loading && !error && <Pressable accessibilityRole="button" style={s.row} onPress={onMore}><Text style={s.body}>더 보기</Text></Pressable>}
  </View>;
}
const s = StyleSheet.create({
  card: { padding: Spacing.cardPadding, borderRadius: Radius.field, backgroundColor: Colors.contextBg, gap: 12 },
  skeleton: { gap: 12 },
  title: { color: Colors.black, fontFamily: Fonts.wantedSemiBold, fontSize: Type.base },
  row: { minHeight: 44, gap: 4, justifyContent: 'center' },
  name: { color: Colors.black, fontFamily: Fonts.wantedMedium, fontSize: Type.base },
  body: { color: Colors.gray600, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, lineHeight: 20 },
});
