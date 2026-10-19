import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { HomeAlert, Store } from '../../types';
import { useHomeAlerts } from '../hooks/useHomeAlerts';

export function HomeAlertsPanel({ active = true, refreshKey = 0, todaySales, store, financial = true }: {
  active?: boolean; refreshKey?: number; todaySales?: number; store?: Store; financial?: boolean;
}) {
  const { alerts, error, refetch, markRead } = useHomeAlerts(todaySales, store, financial);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => { if (active) void refetch(); }, [active, refreshKey, refetch]);
  async function read(alert: HomeAlert, open: boolean) {
    if (saving) return;
    setSaving(alert.key);
    try {
      const current = await markRead(alert.key);
      if (open && current && mounted.current) router.push(alert.route as never);
    } catch {
      Alert.alert('읽음 처리 실패', '읽음 상태를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally { setSaving(null); }
  }
  if (!error && alerts.length === 0) return null;
  return <View style={styles.list}>
    {store && <Text style={styles.storeName}>{store.name}</Text>}
    {error && <TouchableOpacity onPress={() => void refetch()} accessibilityRole="button" style={styles.row}>
      <Text style={styles.message}>{error}</Text><Text style={styles.action}>다시 시도</Text>
    </TouchableOpacity>}
    {alerts.map(alert => <View key={alert.key} style={styles.row}>
      <TouchableOpacity style={styles.content} onPress={() => void read(alert, true)} disabled={saving !== null} accessibilityRole="button">
        <View style={styles.dot} /><Text style={styles.message}>{alert.message}</Text>
        <Text style={styles.action}>{alert.actionLabel} ›</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.dismiss} onPress={() => void read(alert, false)} disabled={saving !== null}
        accessibilityRole="button" accessibilityLabel={`${alert.message} 읽음 처리`}>
        <Ionicons name="checkmark" size={18} color={Colors.gray500} />
      </TouchableOpacity>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  list: { gap: 6 }, storeName: { fontSize: 12, fontWeight: '600', color: Colors.gray600 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.warningBg, borderRadius: 10, paddingLeft: 12, paddingRight: 8 },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.warningStroke },
  message: { flex: 1, fontSize: 12, lineHeight: 18, color: Colors.gray700 },
  action: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  dismiss: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
