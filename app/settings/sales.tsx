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

// "HH:MM" → 24시간 정수 (분은 무시, 정시 기준)
function parseHour24(time: string | null | undefined): number {
  const h = Number((time ?? '23:00').slice(0, 2));
  return Number.isFinite(h) ? h : 23;
}

// 24시간 → { 오전/오후, 12시간제 시 }
function to12h(hour24: number): { meridiem: Meridiem; hour12: number } {
  const meridiem: Meridiem = hour24 < 12 ? '오전' : '오후';
  const raw = hour24 % 12;
  return { meridiem, hour12: raw === 0 ? 12 : raw };
}

// { 오전/오후, 12시간제 시 } → 24시간
function to24h(meridiem: Meridiem, hour12: number): number {
  if (meridiem === '오전') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

// 24시간 → "오전/오후 N시" 라벨
function formatLabel(hour24: number): string {
  const { meridiem, hour12 } = to12h(hour24);
  return `${meridiem} ${hour12}시`;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1~12

export default function SalesSettingsScreen() {
  const { store, refreshStore } = useAuth();
  const initialHour = parseHour24(store?.closing_time as string | null | undefined);

  // 모드: 'midnight'(오전 12시 프리셋) | 'custom'(직접 입력)
  const [mode, setMode] = useState<'midnight' | 'custom'>(initialHour === 0 ? 'midnight' : 'custom');
  const [meridiem, setMeridiem] = useState<Meridiem>(to12h(initialHour).meridiem);
  const [hour12, setHour12] = useState<number>(to12h(initialHour).hour12);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<null | 'meridiem' | 'hour'>(null);

  useEffect(() => {
    const h = parseHour24(store?.closing_time as string | null | undefined);
    setMode(h === 0 ? 'midnight' : 'custom');
    setMeridiem(to12h(h).meridiem);
    setHour12(to12h(h).hour12);
  }, [store?.id]);

  const selectedHour24 = mode === 'midnight' ? 0 : to24h(meridiem, hour12);
  const dirty = selectedHour24 !== initialHour;

  const closingLabel = useMemo(() => formatLabel(selectedHour24), [selectedHour24]);
  const nextLabel = `익일 ${closingLabel}`;

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
      Alert.alert('저장 완료', '매출 마감 시간이 변경되었어요.');
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
        <Text style={styles.title}>매출 마감 시간</Text>
        <TouchableOpacity
          style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.saveBtnText}>저장</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>매장의 운영 시간에 따라 설정해주세요</Text>

        {/* 프리셋: 오전 12시 */}
        <OptionCard
          caption="저녁에 마감하는 매장이라면"
          title="오전 12시"
          selected={mode === 'midnight'}
          onPress={() => setMode('midnight')}
        />

        {/* 직접 입력 */}
        <OptionCard
          caption="새벽까지 운영하는 매장이라면"
          title="직접 입력"
          selected={mode === 'custom'}
          onPress={() => setMode('custom')}
        >
          {mode === 'custom' && (
            <>
              <View style={styles.selectRow}>
                <SelectField value={meridiem} onPress={() => setPicker('meridiem')} flex={1} />
                <SelectField value={`${hour12}시`} onPress={() => setPicker('hour')} flex={1.4} />
              </View>
              <Text style={styles.helperText}>실제 매장의 운영 마감시간보다 3시간 늦은 시간으로 선택해주세요.</Text>
            </>
          )}
        </OptionCard>

        {/* 설명 */}
        <Text style={styles.explainTitle}>매출 마감 시간을 왜 정하나요?</Text>
        <Text style={styles.explainDesc}>하루의 매출로 삼을 기준 시각이 필요하기 때문이에요.</Text>

        <View style={styles.diagram}>
          <View style={styles.diagramLabels}>
            <Text style={styles.diagramTime}>{closingLabel}</Text>
            <Text style={styles.diagramTime}>{nextLabel}</Text>
          </View>
          <View style={styles.diagramBar} />
          <Text style={styles.diagramCaption}>하루 매출</Text>
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

function OptionCard({
  caption, title, selected, onPress, children,
}: {
  caption: string; title: string; selected: boolean; onPress: () => void; children?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[styles.optionCard, selected && styles.optionCardActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.optionRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.optionCaption}>{caption}</Text>
          <Text style={[styles.optionTitle, selected && styles.optionTitleActive]}>{title}</Text>
        </View>
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={selected ? Colors.primary : Colors.gray300}
        />
      </View>
      {children}
    </TouchableOpacity>
  );
}

function SelectField({ value, onPress, flex }: { value: string; onPress: () => void; flex: number }) {
  return (
    <TouchableOpacity style={[styles.selectField, { flex }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.selectValue}>{value}</Text>
      <Ionicons name="chevron-down" size={16} color={Colors.gray400} />
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
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  scroll: { padding: 20, paddingBottom: 48 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.black, marginBottom: 16 },

  optionCard: {
    backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray100,
    padding: 18, marginBottom: 12,
  },
  optionCardActive: { borderColor: Colors.primary, backgroundColor: Colors.tinted },
  optionRow: { flexDirection: 'row', alignItems: 'center' },
  optionCaption: { fontSize: 12, color: Colors.gray400, marginBottom: 4 },
  optionTitle: { fontSize: 17, fontWeight: '700', color: Colors.gray500 },
  optionTitleActive: { color: Colors.black },

  selectRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  selectField: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  selectValue: { fontSize: 15, color: Colors.black, fontWeight: '500' },
  helperText: { fontSize: 12, color: Colors.gray400, marginTop: 10 },

  explainTitle: { fontSize: 15, fontWeight: '700', color: Colors.black, marginTop: 28 },
  explainDesc: { fontSize: 13, color: Colors.gray500, marginTop: 6 },
  diagram: { marginTop: 24, alignItems: 'center' },
  diagramLabels: { flexDirection: 'row', justifyContent: 'space-between', width: '70%' },
  diagramTime: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  diagramBar: {
    width: '70%', height: 8, backgroundColor: Colors.primary, borderRadius: 4, marginTop: 8,
    opacity: 0.85,
  },
  diagramCaption: { fontSize: 13, color: Colors.gray500, marginTop: 10 },

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
