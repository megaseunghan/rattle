import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useAuth, DevPreviewMode } from '../contexts/AuthContext';
import { useEmployees } from '../hooks/useEmployees';

const MODES: { key: DevPreviewMode; label: string }[] = [
  { key: 'self', label: '사장님' },
  { key: 'regular', label: '직원' },
  { key: 'part_time', label: '파트타이머' },
];

/**
 * 관리자 전용 — 앱 전체 화면에 떠 있는 테스트용 역할 전환 버튼.
 * 실제 로그인 계정은 그대로 두고 currentRole/특정 직원 데이터만 클라이언트에서 바꿔치기해서
 * 화면 21/22/24/25 등 직원용 화면들을 실계정 로그인 없이 미리 볼 수 있게 한다.
 */
export function DevRoleSwitcher() {
  const { realRole, devPreviewMode, devPreviewEmployeeId, setDevPreview } = useAuth();
  const { employees, refetch } = useEmployees();
  const [open, setOpen] = useState(false);

  useEffect(() => { if (realRole === 'admin') refetch(); }, [realRole, refetch]);

  if (realRole !== 'admin') return null;

  const candidates = employees.filter(e => e.employment_type === devPreviewMode);
  const activeLabel = MODES.find(m => m.key === devPreviewMode)?.label ?? '사장님';

  function handleModeSelect(mode: DevPreviewMode) {
    if (mode === 'self') { setDevPreview('self', null); return; }
    const first = employees.find(e => e.employment_type === mode);
    setDevPreview(mode, first?.id ?? null);
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {open && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>테스트 보기</Text>
          <View style={styles.tabRow}>
            {MODES.map(m => (
              <TouchableOpacity
                key={m.key}
                style={[styles.tab, devPreviewMode === m.key && styles.tabActive]}
                onPress={() => handleModeSelect(m.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, devPreviewMode === m.key && styles.tabTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {devPreviewMode !== 'self' && (
            candidates.length === 0 ? (
              <Text style={styles.empty}>{devPreviewMode === 'part_time' ? '등록된 파트타이머가 없어요' : '등록된 직원이 없어요'}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {candidates.map(e => (
                  <TouchableOpacity
                    key={e.id}
                    style={[styles.chip, devPreviewEmployeeId === e.id && styles.chipActive]}
                    onPress={() => setDevPreview(devPreviewMode, e.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, devPreviewEmployeeId === e.id && styles.chipTextActive]}>{e.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.fab, devPreviewMode !== 'self' && styles.fabActive]}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.85}
      >
        <Ionicons name="eye-outline" size={14} color={Colors.white} />
        <Text style={styles.fabText} numberOfLines={1}>{activeLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', right: 12, bottom: 100, alignItems: 'flex-end', zIndex: 999, elevation: 20,
  },
  fab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.gray700, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 9,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8,
  },
  fabActive: { backgroundColor: Colors.warningStroke },
  fabText: { fontSize: 12, fontWeight: '700', color: Colors.white, maxWidth: 80 },

  panel: {
    width: 220, backgroundColor: Colors.white, borderRadius: 14, padding: 12, gap: 8, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 12,
  },
  panelTitle: { fontSize: 11, fontWeight: '700', color: Colors.gray500 },
  tabRow: { flexDirection: 'row', gap: 6 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: Colors.gray50 },
  tabActive: { backgroundColor: Colors.black },
  tabText: { fontSize: 11, fontWeight: '600', color: Colors.gray600 },
  tabTextActive: { color: Colors.white },
  chipRow: { gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: Colors.gray200 },
  chipActive: { backgroundColor: Colors.tinted, borderColor: Colors.primary },
  chipText: { fontSize: 11, fontWeight: '500', color: Colors.gray600 },
  chipTextActive: { color: Colors.primary, fontWeight: '700' },
  empty: { fontSize: 11, fontWeight: '500', color: Colors.gray400 },
});
