import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import {
  clockIn, clockOut, getTodayAttendance,
  calcDistanceM, isWithinRadius,
} from '../../lib/services/attendance';
import { Attendance, Employee } from '../../types';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function EmployeeCard({
  employee,
  records,
  onClockIn,
  onClockOut,
  stamping,
}: {
  employee: Employee;
  records: Attendance[];
  onClockIn: () => void;
  onClockOut: () => void;
  stamping: boolean;
}) {
  const lastRecord = records[records.length - 1];
  const isClockedIn = lastRecord?.type === 'clock_in';
  const clockInRecord  = records.find(r => r.type === 'clock_in');
  const clockOutRecord = records.findLast(r => r.type === 'clock_out');

  return (
    <View style={styles.empCard}>
      <View style={styles.empHeader}>
        <View style={styles.empInfo}>
          <Text style={styles.empName}>{employee.name}</Text>
          <View style={[styles.statusBadge, isClockedIn ? styles.statusIn : clockOutRecord ? styles.statusOut : styles.statusNone]}>
            <Text style={[styles.statusText, isClockedIn ? styles.statusTextIn : clockOutRecord ? styles.statusTextOut : styles.statusTextNone]}>
              {isClockedIn ? '근무 중' : clockOutRecord ? '퇴근' : '미출근'}
            </Text>
          </View>
        </View>

        {stamping
          ? <ActivityIndicator size="small" color={Colors.primary} />
          : isClockedIn
            ? <TouchableOpacity style={styles.clockOutBtn} onPress={onClockOut} activeOpacity={0.7}>
                <Ionicons name="log-out-outline" size={15} color={Colors.white} />
                <Text style={styles.clockOutBtnText}>퇴근</Text>
              </TouchableOpacity>
            : !clockOutRecord
              ? <TouchableOpacity style={styles.clockInBtn} onPress={onClockIn} activeOpacity={0.7}>
                  <Ionicons name="log-in-outline" size={15} color={Colors.white} />
                  <Text style={styles.clockInBtnText}>출근</Text>
                </TouchableOpacity>
              : null
        }
      </View>

      {(clockInRecord || clockOutRecord) && (
        <View style={styles.timeRow}>
          {clockInRecord && (
            <View style={styles.timeItem}>
              <Ionicons name="enter-outline" size={12} color={Colors.gray400} />
              <Text style={styles.timeLabel}>출근</Text>
              <Text style={styles.timeValue}>{formatTime(clockInRecord.timestamp)}</Text>
            </View>
          )}
          {clockOutRecord && (
            <View style={styles.timeItem}>
              <Ionicons name="exit-outline" size={12} color={Colors.gray400} />
              <Text style={styles.timeLabel}>퇴근</Text>
              <Text style={styles.timeValue}>{formatTime(clockOutRecord.timestamp)}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function AttendanceScreen() {
  const { store, user, refreshStore } = useAuth();
  const { employees, loading: empLoading, refetch: refetchEmp } = useEmployees();

  // 로그인 본인에 연결된 직원만 출퇴근 가능
  const myEmployees = employees.filter(e => e.user_id === user?.id);

  const [recordsByEmp, setRecordsByEmp] = useState<Record<string, Attendance[]>>({});
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [stampingId, setStampingId] = useState<string | null>(null);

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

  const loadRecords = useCallback(async () => {
    if (!store || myEmployees.length === 0) return;
    setLoadingRecords(true);
    try {
      const results = await Promise.all(
        myEmployees.map(emp => getTodayAttendance(store.id, emp.id).then(recs => ({ id: emp.id, recs })))
      );
      const map: Record<string, Attendance[]> = {};
      results.forEach(({ id, recs }) => { map[id] = recs; });
      setRecordsByEmp(map);
    } finally {
      setLoadingRecords(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, employees, user?.id]);

  useFocusEffect(useCallback(() => {
    refreshStore();
    refetchEmp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  useEffect(() => { loadRecords(); }, [loadRecords]);

  async function handleStamp(employee: Employee, type: 'clock_in' | 'clock_out') {
    if (!store) return;

    if (store.latitude == null || store.longitude == null) {
      Alert.alert('위치 미설정', '매장 위치가 등록되어 있지 않습니다.\n설정 > 매장 위치 등록에서 먼저 설정해주세요.');
      return;
    }

    setStampingId(employee.id);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '위치 권한이 필요합니다.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const distanceM = calcDistanceM(
        loc.coords.latitude, loc.coords.longitude,
        store.latitude!, store.longitude!,
      );

      if (!isWithinRadius(distanceM)) {
        Alert.alert(
          '위치 확인 실패',
          `매장에서 ${Math.round(distanceM)}m 떨어져 있어요.\n40m 이내에서만 출퇴근이 가능합니다.`,
        );
        return;
      }

      const fn = type === 'clock_in' ? clockIn : clockOut;
      const record = await fn(store.id, employee.id, loc.coords.latitude, loc.coords.longitude, distanceM);

      setRecordsByEmp(prev => ({
        ...prev,
        [employee.id]: [...(prev[employee.id] ?? []), record],
      }));

      const wageLine = type === 'clock_out' && record.daily_wage != null
        ? `\n근무 ${record.worked_minutes}분 · 일급 ${record.daily_wage.toLocaleString()}원`
        : '';
      Alert.alert(
        type === 'clock_in' ? '출근 완료' : '퇴근 완료',
        `${employee.name} · ${formatTime(record.timestamp)}\n매장까지 ${Math.round(distanceM)}m${wageLine}`,
      );
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setStampingId(null);
    }
  }

  const hasLocation = store?.latitude != null && store?.longitude != null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.black} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>출퇴근</Text>
          <Text style={styles.headerDate}>{today}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {!hasLocation && (
        <TouchableOpacity style={styles.locationBanner} onPress={() => router.push('/settings/store-location')} activeOpacity={0.8}>
          <Ionicons name="location-outline" size={16} color="#92400E" />
          <Text style={styles.locationBannerText}>매장 위치를 먼저 등록해주세요</Text>
          <Ionicons name="chevron-forward" size={14} color="#92400E" />
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {empLoading || loadingRecords
          ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
          : myEmployees.length === 0
            ? (
              <View style={styles.empty}>
                <Ionicons name="person-circle-outline" size={36} color={Colors.gray300} />
                <Text style={styles.emptyText}>연결된 직원 정보가 없어요</Text>
                <Text style={styles.emptySub}>관리자에게 계정 연결을 요청해주세요</Text>
              </View>
            )
            : myEmployees.map(emp => (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                records={recordsByEmp[emp.id] ?? []}
                stamping={stampingId === emp.id}
                onClockIn={() => handleStamp(emp, 'clock_in')}
                onClockOut={() => handleStamp(emp, 'clock_out')}
              />
            ))
        }
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.black },
  headerDate: { fontSize: 12, color: Colors.gray400, marginTop: 1 },

  locationBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#FDE68A',
  },
  locationBannerText: { flex: 1, fontSize: 13, color: '#92400E', fontWeight: '500' },

  scroll: { padding: 16, gap: 10, paddingBottom: 48 },

  empCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 0.5, borderColor: Colors.gray100, padding: 16,
  },
  empHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empName: { fontSize: 15, fontWeight: '600', color: Colors.black },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusIn:   { backgroundColor: '#D1FAE5' },
  statusOut:  { backgroundColor: Colors.gray100 },
  statusNone: { backgroundColor: Colors.gray50, borderWidth: 0.5, borderColor: Colors.gray200 },
  statusText: { fontSize: 11, fontWeight: '600' },
  statusTextIn:   { color: '#065F46' },
  statusTextOut:  { color: Colors.gray500 },
  statusTextNone: { color: Colors.gray400 },

  clockInBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  clockInBtnText: { fontSize: 13, fontWeight: '600', color: Colors.white },
  clockOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.gray700, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  clockOutBtnText: { fontSize: 13, fontWeight: '600', color: Colors.white },

  timeRow: { flexDirection: 'row', gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  timeItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeLabel: { fontSize: 11, color: Colors.gray400 },
  timeValue: { fontSize: 12, fontWeight: '600', color: Colors.gray600 },

  empty: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.gray500, fontWeight: '500' },
  emptySub: { fontSize: 12, color: Colors.gray400 },
});
