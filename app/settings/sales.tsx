import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { supabase } from '../../lib/supabase';

type Meridiem = '오전' | '오후';

// "HH:MM" → 24시간 정수 (정시 기준, 분 무시)
function parseHour24(time: string | null | undefined): number {
  const h = Number((time ?? '23:00').slice(0, 2));
  return Number.isFinite(h) ? h : 23;
}

function to12h(hour24: number): { meridiem: Meridiem; hour12: number } {
  const meridiem: Meridiem = hour24 < 12 ? '오전' : '오후';
  const raw = hour24 % 12;
  return { meridiem, hour12: raw === 0 ? 12 : raw };
}

function to24h(meridiem: Meridiem, hour12: number): number {
  if (meridiem === '오전') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

function formatLabel(hour24: number): string {
  const { meridiem, hour12 } = to12h(hour24);
  return `${meridiem} ${hour12}시`;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1~12

export default function SalesSettingsScreen() {
  const { store, refreshStore } = useAuth();
  const initialHour = parseHour24(store?.closing_time as string | null | undefined);

  const [meridiem, setMeridiem] = useState<Meridiem>(to12h(initialHour).meridiem);
  const [hour12, setHour12] = useState<number>(to12h(initialHour).hour12);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<null | 'meridiem' | 'hour'>(null);

  useEffect(() => {
    const h = parseHour24(store?.closing_time as string | null | undefined);
    setMeridiem(to12h(h).meridiem);
    setHour12(to12h(h).hour12);
  }, [store?.id]);

  const selectedHour24 = to24h(meridiem, hour12);
  const dirty = selectedHour24 !== initialHour;
  const label = useMemo(() => formatLabel(selectedHour24), [selectedHour24]);

  async function handleSave() {
    if (!store) return;
    setSaving(true);
    try {
      const closing = `${String(selectedHour24).padStart(2, '0')}:00`;
      const { error } = await supabase
        .from('stores')
        .update({ closing_time: closing })
        .eq('id', store.id);
      if (error) throw error;
      await refreshStore();
      Alert.alert('저장 완료', '하루 매출 사이클이 변경되었어요.');
      router.back();
    } catch (e: unknown) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>매출 정산 설정하기</Text>
        <TouchableOpacity
          style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveBtnText}>저장</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 선택값 미리보기 */}
        <View style={styles.heroCard}>
          <Text style={styles.heroCaption}>설정된 시간 기준으로 매장의 하루 매출을 정산합니다.</Text>
          <Text style={styles.heroValue}>{label}</Text>
          <View style={styles.heroRange}>
            <Ionicons name="time-outline" size={14} color={Colors.primary} />
            <Text style={styles.heroRangeText}>{label} → 익일 {label}</Text>
          </View>
        </View>

        {/* 마감 시각 선택 (드롭다운) */}
        <View style={styles.selectRow}>
          <SelectField value={meridiem} onPress={() => setPicker('meridiem')} flex={1} />
          <SelectField value={`${hour12}시`} onPress={() => setPicker('hour')} flex={1.2} />
        </View>

        {/* 안내 */}
        <View style={styles.guideCard}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.gray400} />
          <Text style={styles.guideText}>
            {label}부터 익일 {label}까지의 주문을 하루 매출로 정산합니다.
          </Text>
        </View>
      </ScrollView>

      {/* 셀렉트 모달 */}
      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>{picker === 'meridiem' ? '오전 / 오후' : '시간 선택'}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {picker === 'meridiem'
                ? (['오전', '오후'] as Meridiem[]).map(opt => (
                    <SelectOption
                      key={opt}
                      label={opt}
                      selected={meridiem === opt}
                      onPress={() => { setMeridiem(opt); setPicker(null); }}
                    />
                  ))
                : HOURS_12.map(h => (
                    <SelectOption
                      key={h}
                      label={`${h}시`}
                      selected={hour12 === h}
                      onPress={() => { setHour12(h); setPicker(null); }}
                    />
                  ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function SelectField({ value, onPress, flex }: { value: string; onPress: () => void; flex: number }) {
  return (
    <TouchableOpacity style={[styles.selectField, { flex }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.selectValue}>{value}</Text>
      <Ionicons name="chevron-down" size={18} color={Colors.gray400} />
    </TouchableOpacity>
  );
}

function SelectOption({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.optionItem} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.optionItemText, selected && styles.optionItemTextActive]}>{label}</Text>
      {selected && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.white,
    borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: Colors.black },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  scroll: { padding: 20, paddingBottom: 48 },

  heroCard: {
    backgroundColor: Colors.tinted, borderRadius: 20, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.primary + '22',
  },
  heroCaption: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  heroValue: { fontSize: 25, fontWeight: '800', color: Colors.primary, marginTop: 6, letterSpacing: -1 },
  heroRange: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  heroRangeText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  guideCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16,
    backgroundColor: Colors.gray100, borderRadius: 12, padding: 14,
  },
  guideText: { flex: 1, fontSize: 13, color: Colors.gray600, lineHeight: 19 },

  selectRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  selectField: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16,
  },
  selectValue: { fontSize: 16, color: Colors.black, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 12 },
  optionItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  optionItemText: { fontSize: 16, color: Colors.gray700 },
  optionItemTextActive: { color: Colors.primary, fontWeight: '700' },
});
