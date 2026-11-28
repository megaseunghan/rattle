/* design-system: DESIGN.md — S54 '지급 대기' 탭. 사람별로 묶어 골라서 지급 완료로 바꾼다. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { CardStyle, Type } from '../../../constants/designTokens';
import { AppIcon } from '../../icons/AppIcon';
import { EmptyState } from '../ui/EmptyState';
import { NumericText } from '../ui/NumericText';
import { dayLabel, won } from './format';
import { CheckMark } from './parts';
import type { DailyLaborEntry, DailyLaborer } from '../../../types';

interface PendingListProps {
  entries: DailyLaborEntry[];
  laborerById: ReadonlyMap<string, DailyLaborer>;
  selected: ReadonlySet<string>;
  insuranceIds: ReadonlySet<string>;
  onToggle: (entryIds: string[], next: boolean) => void;
  onOpenPerson: (laborerId: string) => void;
}

function entryNote(entry: DailyLaborEntry): string {
  return [entry.extra_pay ? `추가 ${won(entry.extra_pay)}` : '', entry.memo ?? ''].filter(Boolean).join(' · ');
}

export function PendingList({ entries, laborerById, selected, insuranceIds, onToggle, onOpenPerson }: PendingListProps) {
  if (!entries.length) return <EmptyState icon="calendar-outline" title="지급 대기 중인 기록이 없어요" description="명단에서 사람을 골라 근무 기록을 추가해 주세요." />;
  const total = entries.reduce((sum, e) => sum + e.gross, 0);
  const laborerIds = [...new Set(entries.map(e => e.laborer_id))];
  return (
    <View style={styles.wrap}>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>지급 대기 · 세금 떼기 전</Text>
        <NumericText style={styles.summaryValue}>{won(total)}</NumericText>
      </View>
      {laborerIds.map(laborerId => {
        const own = entries.filter(e => e.laborer_id === laborerId);
        const ids = own.map(e => e.id);
        const all = ids.every(id => selected.has(id));
        const name = laborerById.get(laborerId)?.name ?? '명단에 없는 사람';
        return (
          <View key={laborerId} style={styles.group}>
            <View style={styles.groupHead}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: all }} accessibilityLabel={`${name} 기록 모두 고르기`}
                onPress={() => onToggle(ids, !all)} style={styles.groupPick}>
                <CheckMark checked={all} />
                <Text style={styles.name} numberOfLines={1}>{name}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${name} 근무 기록 보기`} onPress={() => onOpenPerson(laborerId)} style={styles.go}>
                <Text style={styles.goText}>{own.length}일</Text>
                <AppIcon name="chevron-forward" size={16} color={Colors.gray400} />
              </Pressable>
            </View>
            {own.map(entry => {
              const on = selected.has(entry.id);
              const note = entryNote(entry);
              return (
                <Pressable key={entry.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  accessibilityLabel={`${dayLabel(entry.work_date)} ${won(entry.gross)}`} onPress={() => onToggle([entry.id], !on)} style={styles.row}>
                  <CheckMark checked={on} small />
                  <View style={styles.rowMain}>
                    <Text style={styles.date}>{dayLabel(entry.work_date)}</Text>
                    {!!note && <Text style={styles.note} numberOfLines={1}>{note}</Text>}
                  </View>
                  <NumericText style={styles.amount}>{won(entry.gross)}</NumericText>
                </Pressable>
              );
            })}
            {insuranceIds.has(laborerId) && <Text style={styles.insurance}>이번 달 8일 이상 일했어요. 국민연금·건강보험 가입 대상일 수 있어요.</Text>}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  summary: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  summaryLabel: { fontSize: Type.sm, color: Colors.gray600 },
  summaryValue: { fontSize: 26, fontWeight: '700', color: Colors.black },
  group: { ...CardStyle, paddingHorizontal: 14, paddingVertical: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupPick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  name: { flexShrink: 1, fontSize: Type.md + 1, fontWeight: '700', color: Colors.black },
  go: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, minWidth: 44, justifyContent: 'flex-end' },
  goText: { fontSize: Type.sm, color: Colors.gray500 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderTopWidth: 1, borderTopColor: Colors.hairline },
  rowMain: { flex: 1, gap: 2 },
  date: { fontSize: Type.md, fontWeight: '600', color: Colors.black },
  note: { fontSize: Type.xs + 1, color: Colors.gray500 },
  amount: { fontSize: Type.md, fontWeight: '600', color: Colors.black },
  insurance: { fontSize: Type.xs + 1, color: Colors.gray500, paddingVertical: 8, lineHeight: 17 },
});
