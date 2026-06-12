import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
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
        <Text style={styles.title}>하루 매출 사이클 설정하기</Text>
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
          <Text style={styles.heroCaption}>이 시각에 하루 장부를 끊어요</Text>
          <Text style={styles.heroValue}>{label}</Text>
          <View style={styles.heroRange}>
            <Ionicons name="time-outline" size={14} color={Colors.primary} />
            <Text style={styles.heroRangeText}>{label} → 익일 {label}</Text>
          </View>
        </View>

        {/* 마감 시각 선택 (picker) */}
        <View style={styles.pickerCard}>
          <View style={styles.segment}>
            {(['오전', '오후'] as Meridiem[]).map(mr => (
              <TouchableOpacity
                key={mr}
                style={[styles.segmentBtn, meridiem === mr && styles.segmentBtnActive]}
                onPress={() => setMeridiem(mr)}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, meridiem === mr && styles.segmentTextActive]}>{mr}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.hourGrid}>
            {HOURS_12.map(h => {
              const active = hour12 === h;
              return (
                <TouchableOpacity
                  key={h}
                  style={[styles.hourCell, active && styles.hourCellActive]}
                  onPress={() => setHour12(h)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.hourText, active && styles.hourTextActive]}>{h}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  heroValue: { fontSize: 40, fontWeight: '800', color: Colors.primary, marginTop: 6, letterSpacing: -1 },
  heroRange: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  heroRangeText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  pickerCard: {
    backgroundColor: Colors.white, borderRadius: 18, borderWidth: 1, borderColor: Colors.gray100,
    padding: 16, marginTop: 20,
  },
  segment: {
    flexDirection: 'row', backgroundColor: Colors.gray100, borderRadius: 12, padding: 3, marginBottom: 16,
  },
  segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  segmentBtnActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  segmentText: { fontSize: 14, fontWeight: '600', color: Colors.gray400 },
  segmentTextActive: { color: Colors.black, fontWeight: '700' },

  hourGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hourCell: {
    width: '22.5%', aspectRatio: 1.6, borderRadius: 12, backgroundColor: Colors.gray50,
    borderWidth: 1, borderColor: Colors.gray100, alignItems: 'center', justifyContent: 'center',
  },
  hourCellActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  hourText: { fontSize: 16, fontWeight: '600', color: Colors.gray600 },
  hourTextActive: { color: Colors.white, fontWeight: '800' },
});
