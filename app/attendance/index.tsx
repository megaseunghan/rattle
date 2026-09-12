import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { getTodayAttendance } from '../../lib/services/attendance';
import { Attendance, Employee } from '../../types';
import { Badge } from '../../lib/components/ui';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function EmployeeCard({
  employee,
  records,
}: {
  employee: Employee;
  records: Attendance[];
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
          <Badge
            label={isClockedIn ? '근무 중' : clockOutRecord ? '퇴근' : '미출근'}
            variant={isClockedIn ? 'positive' : 'neutral'}
          />
        </View>
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

      <TouchableOpacity
        style={styles.historyLink}
        onPress={() => router.push(`/attendance/${employee.id}?name=${encodeURIComponent(employee.name)}`)}
        hitSlop={8}
      >
        <Text style={styles.historyLinkText}>이번 달 전체 기록 보기</Text>
        <Ionicons name="chevron-forward" size={13} color={Colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

export default function AttendanceScreen() {
  const { store, user, refreshStore, devPreviewEmployeeId } = useAuth();
  const { employees, loading: empLoading, refetch: refetchEmp } = useEmployees();

  // 로그인 본인에 연결된 직원만 출퇴근 가능
  const myEmployees = devPreviewEmployeeId
    ? employees.filter(e => e.id === devPreviewEmployeeId)
    : employees.filter(e => e.user_id === user?.id);

  const [recordsByEmp, setRecordsByEmp] = useState<Record<string, Attendance[]>>({});
  const [loadingRecords, setLoadingRecords] = useState(false);

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
        <TouchableOpacity style={styles.locationBanner} onPress={() => router.push('/settings/store')} activeOpacity={0.8}>
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

  timeRow: { flexDirection: 'row', gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  historyLink: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 10 },
  historyLinkText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  timeItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeLabel: { fontSize: 11, color: Colors.gray400 },
  timeValue: { fontSize: 12, fontWeight: '600', color: Colors.gray600 },

  empty: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyText: { fontSize: 14, color: Colors.gray500, fontWeight: '500' },
  emptySub: { fontSize: 12, color: Colors.gray400 },
});
