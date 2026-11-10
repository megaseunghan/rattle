import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppIcon } from '../../lib/icons/AppIcon';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { ChecklistProgress } from '../../lib/components/ChecklistProgress';
import { useAuth } from '../../lib/contexts/AuthContext';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useCleaningChecklist } from '../../lib/hooks/useCleaningChecklist';
import { getErrorMessage } from '../../lib/utils/error';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { AppBar, EmptyState } from '../../lib/components/ui';
import { CleaningItem, CleaningSegment } from '../../types';

const SEGMENTS: { key: CleaningSegment; label: string }[] = [
  { key: 'open', label: '오픈' },
  { key: 'close', label: '마감' },
  { key: 'weekday', label: '요일별' },
];

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatCheckedTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function CleaningScreen() {
  const { store, user, devPreviewEmployeeId } = useAuth();
  const { employees, refetch: refetchEmployees } = useEmployees();
  const { items, logs, loading, error, itemsReady, checkingId, refetch, toggle } = useCleaningChecklist();
  const params = useLocalSearchParams<{ segment?: string }>();
  const [segment, setSegment] = useState<CleaningSegment>(params.segment === 'close' || params.segment === 'weekday' ? params.segment : 'open');

  useFocusEffect(useCallback(() => { refetch(); refetchEmployees(); }, [refetch, refetchEmployees]));

  const myName = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId)?.name ?? user?.email ?? '나';
  const todayWeekday = new Date().getDay();

  const segmentItems = useMemo(() => items
    .filter(i => i.segment === segment)
    .filter(i => segment !== 'weekday' || i.weekday === todayWeekday)
    .sort((a, b) => a.sort_order - b.sort_order), [items, segment, todayWeekday]);

  const logByItem = useMemo(() => new Map(logs.map(l => [l.item_id, l])), [logs]);

  return (
    <SafeAreaView style={styles.container}><GlassBackdrop />
      <AppBar
        transparent
        title="청소 체크리스트"
        onBack={() => router.back()}
        rightSlot={(
          <TouchableOpacity onPress={() => router.push('/cleaning/edit')} style={styles.editButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="체크리스트 편집">
            <AppIcon name="pencil" size={18} color={Colors.gray600} />
          </TouchableOpacity>
        )}
      />

      <View style={styles.segmentRow}>
        {SEGMENTS.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[styles.segmentTab, segment === s.key && styles.segmentTabActive]}
            onPress={() => setSegment(s.key)}
            accessibilityRole="tab" accessibilityLabel={s.label} accessibilityState={{ selected: segment === s.key }}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentText, segment === s.key && styles.segmentTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!store ? (
          <Text style={styles.rowMeta}>매장을 선택해주세요.</Text>
        ) : error ? (
          <ErrorMessage message={error} onRetry={() => { void refetch(); }} />
        ) : loading || !itemsReady ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
        ) : segmentItems.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="등록된 체크리스트가 없어요"
            description="연필 아이콘을 눌러 항목을 추가해보세요"
          />
        ) : (
          <View style={styles.list}>
            <View style={styles.progress}>
              <ChecklistProgress done={segmentItems.filter(item => logByItem.has(item.id)).length} total={segmentItems.length} scopeKey={`${user?.id}:${store.id}:${segment}`} />
            </View>
            {segmentItems.map((item: CleaningItem) => {
              const log = logByItem.get(item.id);
              const checked = !!log;
              const busy = checkingId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  testID={`cleaning-row-${item.id}`}
                  style={styles.row}
                  onPress={() => { void toggle(item, myName).catch(e => Alert.alert('체크 결과 확인 필요', getErrorMessage(e), [{ text: '다시 불러오기', onPress: () => { void refetch(); } }])); }}
                  disabled={checkingId !== null}
                  accessibilityRole="checkbox" accessibilityLabel={checked && log ? `${item.title}, ${log.checked_by_name} · ${formatCheckedTime(log.checked_at)} 체크` : item.title}
                  accessibilityState={{ checked, disabled: checkingId !== null, busy }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {busy
                      ? <ActivityIndicator size="small" color={checked ? Colors.white : Colors.primary} />
                      : checked && <AppIcon name="checkmark" size={15} color={Colors.white} />
                    }
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={[styles.rowTitle, checked && styles.rowTitleChecked]}>{item.title}</Text>
                    {segment === 'weekday' && item.weekday != null && (
                      <Text style={styles.rowMeta}>{WEEKDAY_LABELS[item.weekday]}요일</Text>
                    )}
                  </View>
                  <View testID={`cleaning-meta-${item.id}`} style={[styles.completionMeta, !checked && styles.hiddenMeta]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Text numberOfLines={1} ellipsizeMode="tail" style={styles.completionName}>{log?.checked_by_name ?? ' '}</Text>
                    <Text style={styles.completionTime}> · {log ? formatCheckedTime(log.checked_at) : '00:00'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  editButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  segmentRow: {
    flexDirection: 'row', gap: 4, backgroundColor: Colors.gray100,
    borderRadius: 12, padding: 3, marginHorizontal: 20, marginTop: 14,
  },
  segmentTab: { flex: 1, minHeight: 44, paddingVertical: 7, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentTabActive: { backgroundColor: Colors.white },
  segmentText: { fontSize: 14, fontFamily: Fonts.wantedMedium, color: Colors.gray600 },
  segmentTextActive: { color: Colors.action, fontFamily: Fonts.wantedMedium },
  scroll: { padding: 20, paddingBottom: 40 },
  list: { gap: 0 },
  progress: { minHeight: 34, justifyContent: 'center', marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 76,
    paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.homeBorder,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 7,
    borderWidth: 1.5, borderColor: Colors.gray300,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.action, borderColor: Colors.action },
  rowTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 13, lineHeight: 19, fontFamily: Fonts.wantedMedium, color: Colors.black },
  rowTitleChecked: { color: Colors.gray600 },
  rowMeta: { fontVariant: ['tabular-nums'], fontFamily: Fonts.wantedRegular, fontSize: 11, color: Colors.gray600 },
  completionMeta: { width: 104, flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  completionName: { flexShrink: 1, fontFamily: Fonts.wantedRegular, fontSize: 11, lineHeight: 17, color: Colors.gray600 },
  completionTime: { flexShrink: 0, fontFamily: Fonts.wantedRegular, fontVariant: ['tabular-nums'], fontSize: 11, lineHeight: 17, color: Colors.gray600 },
  hiddenMeta: { opacity: 0 },
});
