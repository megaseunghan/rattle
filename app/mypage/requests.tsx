import { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useRequestApprovals } from '../../lib/hooks/useRequestApprovals';
import { ScheduleRequest } from '../../types';
import { AppBar, EmptyState } from '../../lib/components/ui';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function ApproveButtons({ onApprove, onReject, disabled }: {
  onApprove: () => void; onReject: () => void; disabled: boolean;
}) {
  return (
    <View style={styles.actionRow}>
      <TouchableOpacity style={styles.rejectBtn} onPress={onReject} disabled={disabled} activeOpacity={0.7}>
        <Text style={styles.rejectBtnText}>거절</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.approveBtn} onPress={onApprove} disabled={disabled} activeOpacity={0.7}>
        <Text style={styles.approveBtnText}>승인</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RequestApprovalsScreen() {
  const {
    scheduleRequests, loading, reviewingId, totalPending,
    refetch, reviewSchedule,
  } = useRequestApprovals();

  useEffect(() => { refetch(); }, [refetch]);

  function handleScheduleReview(request: ScheduleRequest & { employee_name: string }, approve: boolean) {
    reviewSchedule(request, approve).catch(() => {});
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="요청함" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
        ) : totalPending === 0 ? (
          <EmptyState icon="checkmark-done-outline" title="대기 중인 요청이 없어요" description="스케줄 변경 요청이 오면 여기에 표시돼요" />
        ) : (
          <>
            {scheduleRequests.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>스케줄 변경 요청</Text>
                {scheduleRequests.map(req => (
                  <View key={req.id} style={styles.card}>
                    <Text style={styles.cardName}>{req.employee_name}</Text>
                    <View style={styles.dayList}>
                      {req.days.map(d => (
                        <Text key={d.day_of_week} style={styles.dayLine}>
                          {WEEKDAYS[d.day_of_week]}요일 · {d.is_working ? `${d.start_time?.slice(0, 5)}-${d.end_time?.slice(0, 5)}` : '휴무'}
                        </Text>
                      ))}
                    </View>
                    <ApproveButtons
                      disabled={reviewingId === req.id}
                      onApprove={() => handleScheduleReview(req, true)}
                      onReject={() => handleScheduleReview(req, false)}
                    />
                  </View>
                ))}
              </View>
            )}

          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 20 },

  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.gray600 },

  card: {
    backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder,
    padding: 16, gap: 6,
  },
  cardName: { fontSize: 14, fontWeight: '700', color: Colors.black },
  dayList: { gap: 2 },
  dayLine: { fontSize: 13, fontWeight: '500', color: Colors.gray600 },
  reasonText: { fontSize: 12, fontWeight: '400', color: Colors.gray400, lineHeight: 17 },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  rejectBtn: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray200 },
  rejectBtnText: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  approveBtn: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.primary },
  approveBtnText: { fontSize: 13, fontWeight: '600', color: Colors.white },
});
