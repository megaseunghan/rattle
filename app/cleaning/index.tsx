import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useCleaningChecklist } from '../../lib/hooks/useCleaningChecklist';
import { AppBar, EmptyState } from '../../lib/components/ui';
import { CleaningItem, CleaningSegment } from '../../types';

const SEGMENTS: { key: CleaningSegment; label: string }[] = [
  { key: 'open', label: '오픈' },
  { key: 'close', label: '마감' },
  { key: 'weekday', label: '요일별' },
];

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatCheckedTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export default function CleaningScreen() {
  const { user, devPreviewEmployeeId } = useAuth();
  const { employees, refetch: refetchEmployees } = useEmployees();
  const { items, logs, loading, checkingId, refetch, toggle } = useCleaningChecklist();
  const [segment, setSegment] = useState<CleaningSegment>('open');

  useFocusEffect(useCallback(() => { refetch(); refetchEmployees(); }, [refetch, refetchEmployees]));

  const myName = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId)?.name ?? user?.email ?? '나';
  const todayWeekday = new Date().getDay();

  const segmentItems = items
    .filter(i => i.segment === segment)
    .filter(i => segment !== 'weekday' || i.weekday === todayWeekday)
    .sort((a, b) => a.sort_order - b.sort_order);

  const logByItem = new Map(logs.map(l => [l.item_id, l]));

  return (
    <SafeAreaView style={styles.container}>
      <AppBar
        title="청소 체크리스트"
        onBack={() => router.back()}
        rightSlot={(
          <TouchableOpacity onPress={() => router.push('/cleaning/edit')} hitSlop={8}>
            <Ionicons name="pencil" size={18} color={Colors.gray600} />
          </TouchableOpacity>
        )}
      />

      <View style={styles.segmentRow}>
        {SEGMENTS.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[styles.segmentTab, segment === s.key && styles.segmentTabActive]}
            onPress={() => setSegment(s.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentText, segment === s.key && styles.segmentTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
        ) : segmentItems.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="등록된 체크리스트가 없어요"
            description="연필 아이콘을 눌러 항목을 추가해보세요"
          />
        ) : (
          <View style={styles.list}>
            {segmentItems.map((item: CleaningItem) => {
              const log = logByItem.get(item.id);
              const checked = !!log;
              const busy = checkingId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.row, checked ? styles.rowChecked : styles.rowUnchecked]}
                  onPress={() => toggle(item, myName)}
                  disabled={busy}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {busy
                      ? <ActivityIndicator size="small" color={checked ? Colors.white : Colors.primary} />
                      : checked && <Ionicons name="checkmark" size={15} color={Colors.white} />
                    }
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    {checked && log && (
                      <Text style={styles.rowMeta}>{log.checked_by_name} · {formatCheckedTime(log.checked_at)} 체크</Text>
                    )}
                    {segment === 'weekday' && item.weekday != null && (
                      <Text style={styles.rowMeta}>{WEEKDAY_LABELS[item.weekday]}요일</Text>
                    )}
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
  container: { flex: 1, backgroundColor: Colors.gray50 },
  segmentRow: {
    flexDirection: 'row', gap: 4, backgroundColor: Colors.gray100,
    borderRadius: 12, padding: 3, marginHorizontal: Spacing.screenX, marginTop: 14,
  },
  segmentTab: { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  segmentTabActive: { backgroundColor: Colors.white },
  segmentText: { fontSize: 14, fontWeight: '500', color: Colors.gray400 },
  segmentTextActive: { color: Colors.black, fontWeight: '700' },
  scroll: { padding: Spacing.screenX, paddingBottom: 40 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14,
  },
  rowChecked: { borderWidth: 1, borderColor: Colors.gray100, backgroundColor: Colors.white },
  rowUnchecked: { borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.white },
  checkbox: {
    width: 22, height: 22, borderRadius: 7,
    borderWidth: 1.5, borderColor: Colors.gray300,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  rowTextWrap: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.black },
  rowMeta: { fontSize: 11, fontWeight: '400', color: Colors.gray400 },
});
