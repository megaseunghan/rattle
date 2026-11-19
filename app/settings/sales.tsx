import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fonts } from '../../constants/fonts';
import { AppBar, Button } from '../../lib/components/ui';
import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { ClosingTimeWheel } from '../../lib/components/ClosingTimeWheel';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { updateStoreClosingTime } from '../../lib/services/stores';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { getErrorMessage } from '../../lib/utils/error';

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
  const { store, user, canManageStore, refreshStore } = useAuth();
  const initialHour = parseHour24(store?.closing_time as string | null | undefined);

  const [meridiem, setMeridiem] = useState<Meridiem>(to12h(initialHour).meridiem);
  const [hour12, setHour12] = useState<number>(to12h(initialHour).hour12);
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const reconcile = useRef(false);
  const [reconcileVersion, setReconcileVersion] = useState(0);
  const scope = useMemo(() => ({}), [store?.id, user?.id]);
  const currentScope = useRef<object | null>(scope);
  currentScope.current = scope;
  useEffect(() => { currentScope.current = scope; return () => { currentScope.current = null; }; }, [scope]);
  const [savedNeedsRefresh, setSavedNeedsRefresh] = useState(false);
  const [periodMoving, setPeriodMoving] = useState(false);
  const [hourMoving, setHourMoving] = useState(false);
  const isAdmin = canManageStore;

  useEffect(() => {
    const h = parseHour24(store?.closing_time as string | null | undefined);
    setMeridiem(to12h(h).meridiem);
    setHour12(to12h(h).hour12);
  }, [scope]);
  useEffect(() => {
    if (!reconcile.current || saving || savedNeedsRefresh) return;
    const value = to12h(parseHour24(store?.closing_time));
    setMeridiem(value.meridiem); setHour12(value.hour12);
    reconcile.current = false;
  }, [store, saving, savedNeedsRefresh, reconcileVersion]);

  const selectedHour24 = to24h(meridiem, hour12);
  const dirty = selectedHour24 !== initialHour;
  const allowLeave = useConfirmLeave(dirty || saving, { blockLeave: saving });
  const label = useMemo(() => formatLabel(selectedHour24), [selectedHour24]);

  useEffect(() => { setSavedNeedsRefresh(false); reconcile.current = false; }, [scope]);

  async function handleSave() {
    if (!store || !isAdmin || !dirty || periodMoving || hourMoving || savingLock.current || savedNeedsRefresh) return;
    savingLock.current = true;
    setSaving(true);
    try {
      const closing = `${String(selectedHour24).padStart(2, '0')}:00`;
      await updateStoreClosingTime(store.id, closing);
      if (currentScope.current !== scope) return;
      setSavedNeedsRefresh(true);
      try {
        reconcile.current = true;
        await refreshStore();
        if (currentScope.current !== scope) return;
        setSavedNeedsRefresh(false);
        setReconcileVersion(n => n + 1);
      } catch {
        if (currentScope.current !== scope) return;
        Alert.alert('저장 완료 · 새로고침 필요', '내용은 저장됐어요. 화면을 다시 불러와 확인해주세요.');
        return;
      }
      Alert.alert('저장 완료', '하루 매출 사이클이 변경되었어요.');
      allowLeave();
      router.back();
    } catch (e: unknown) {
      if (currentScope.current !== scope) return;
      Alert.alert('저장 실패', getErrorMessage(e));
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  async function retryRefresh() {
    if (savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    try { reconcile.current = true; await refreshStore(); if (currentScope.current === scope) { setSavedNeedsRefresh(false); setReconcileVersion(n => n + 1); } }
    catch { if (currentScope.current !== scope) return; Alert.alert('새로고침 실패', '저장된 내용은 유지돼요. 잠시 후 다시 불러와 주세요.'); }
    finally { savingLock.current = false; setSaving(false); }
  }

  return (
    <SafeAreaView style={styles.container}>
      <GlassBackdrop />
      <AppBar transparent title="일 정산 시간" onBack={() => { if (!savingLock.current) router.back(); }} />
      {!isAdmin ? <Text style={styles.permission}>일 정산 시간은 관리자만 수정할 수 있어요.</Text> :
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={styles.rangeLabel}>하루 집계 범위</Text>
          <Text style={styles.rangeValue} accessibilityLiveRegion="polite">{label} → 다음 날 {label}</Text>
          <Text style={styles.guideText}>이 시간 사이의 매출을 하루로 집계해요.</Text>
          <View style={styles.wheels}>
            <View pointerEvents="none" style={styles.selection} />
            <ClosingTimeWheel key={`period-${store?.id}-${user?.id}`} label="오전 오후" options={['오전', '오후']}
              index={meridiem === '오전' ? 0 : 1} disabled={saving || savedNeedsRefresh}
              onChange={i => setMeridiem(i === 0 ? '오전' : '오후')} onMoving={setPeriodMoving} />
            <ClosingTimeWheel key={`hour-${store?.id}-${user?.id}`} label="시간" options={HOURS_12.map(h => `${h}시`)}
              index={hour12 - 1} disabled={saving || savedNeedsRefresh}
              onChange={i => setHour12(i + 1)} onMoving={setHourMoving} />
          </View>
        </View>
        <View style={styles.footer}>
          {savedNeedsRefresh && <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => void retryRefresh()} style={styles.retry}>
            <Text style={styles.retryText}>저장된 정보 다시 불러오기</Text>
          </TouchableOpacity>}
          <Button label={saving ? '저장 중...' : '저장하기'} loading={saving} onPress={() => void handleSave()}
            disabled={!dirty || savedNeedsRefresh || periodMoving || hourMoving} />
        </View>
      </ScrollView>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  scroll: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 32, paddingBottom: 20, justifyContent: 'space-between' },
  rangeLabel: { fontFamily: Fonts.wantedRegular, fontSize: 12, color: Colors.gray500 },
  rangeValue: { fontFamily: Fonts.wantedSemiBold, fontSize: 18, lineHeight: 29, color: Colors.black, marginTop: 8, marginBottom: 6 },
  guideText: { fontFamily: Fonts.wantedRegular, fontSize: 13, color: Colors.gray500, lineHeight: 22 },
  wheels: { flexDirection: 'row', gap: 12, marginTop: 28, paddingHorizontal: 22 },
  selection: { position: 'absolute', left: 0, right: 0, top: 68, height: 44, borderRadius: 12,
    backgroundColor: Colors.bg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.homeBorder },
  footer: { paddingTop: 34 },
  retry: { minHeight: 44, justifyContent: 'center', marginBottom: 10 },
  retryText: { fontFamily: Fonts.wantedRegular, fontSize: 13, color: Colors.action },
  permission: { margin: 22, fontFamily: Fonts.wantedRegular, fontSize: 13, color: Colors.gray500 },
});
