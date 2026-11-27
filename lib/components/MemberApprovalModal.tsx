import { useEffect, useState } from 'react';
import { Modal, Alert, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { JoinOnboardingFields, getAdminJoinWageError } from './JoinOnboardingFields';
import { buildJoinOnboarding, OnboardingDraft } from '../utils/joinOnboarding';
import { getErrorMessage } from '../utils/error';
import { revealAccountNumber } from '../services/accountNumbers';
import type { JoinOnboardingReview, JoinOnboardingProfile, MemberApprovalCandidate, MemberApprovalChoice, StoreMember } from '../../types';

interface Props {
  member: StoreMember;
  candidates: MemberApprovalCandidate[];
  busy: boolean;
  profile?: JoinOnboardingProfile | null;
  onChoose: (choice: MemberApprovalChoice, review?: JoinOnboardingReview) => void;
  onClose: () => void;
}

export function MemberApprovalModal({ member, candidates, busy, onChoose, onClose, profile }: Props) {
  const hasApplicantRecord = candidates.some(e => e.is_applicant_account);
  const retiredOnly = candidates.some(e => !e.is_active) && !candidates.some(e => e.is_active);
  const [preserve, setPreserve] = useState<{ memberId: string; employeeId: string; historyId: string } | null>(null);
  const canPreserve = (e: MemberApprovalCandidate) => !e.is_active && !e.has_other_account && (!hasApplicantRecord || e.is_applicant_account)
    && e.wage_condition_valid === true && !!e.wage_history_id && !!e.existing_wage;
  const preserved = candidates.find(e => canPreserve(e) && preserve?.memberId === member.id && e.id === preserve?.employeeId && e.wage_history_id === preserve?.historyId);
  const [draft, setDraft] = useState<OnboardingDraft>({ employmentType: profile?.employment_type ?? 'regular',
    hourlyWage: profile?.hourly_wage?.toString() ?? '', weeklyHours: profile?.weekly_hours?.toString() ?? '',
    baseSalary: profile?.base_salary?.toString() ?? '', nonTaxable: profile?.non_taxable?.toString() ?? '0',
    joinedAt: profile?.joined_at ?? '', bankName: profile?.bank_name ?? '',
    // 계좌번호는 암호화 토큰으로 오므로 화면에 넣지 않고, 아래에서 전체 번호를 받아 채운다.
    accountNumber: profile?.account_number?.startsWith('enc:') ? '' : profile?.account_number ?? '' });
  const [accountNote, setAccountNote] = useState<string | null>(null);
  useEffect(() => {
    if (!profile?.account_number?.startsWith('enc:')) return;
    let alive = true;
    revealAccountNumber('join_profile', member.id)
      .then(number => {
        if (!alive) return;
        if (number) setDraft(d => (d.accountNumber ? d : { ...d, accountNumber: number }));
        else setAccountNote('제출한 계좌번호를 확인하지 못했어요. 직원에게 확인해 다시 입력해 주세요.');
      })
      .catch(e => { if (alive) setAccountNote(getErrorMessage(e)); });
    return () => { alive = false; };
  }, [member.id, profile?.account_number]);
  const cannotApprove = busy || !!preserved || !!getAdminJoinWageError(draft);
  function choose(choice: MemberApprovalChoice) {
    if (busy) return;
    if (preserved && choice.kind === 'rehire' && choice.employeeId === preserved.id) {
      onChoose(choice, { preserve_existing_wage: true, wage_history_id: preserved.wage_history_id! }); return;
    }
    if (cannotApprove) return;
    try { onChoose(choice, buildJoinOnboarding(draft)); }
    catch (e) { Alert.alert('입력 확인', getErrorMessage(e)); }
  }
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
      <View style={styles.overlay}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title}>합류 전 정보 확인</Text>
          <Text style={styles.body}>{member.applicant_name} · {member.phone}</Text>
          {retiredOnly && <Text style={styles.body}>이름이나 연락처가 겹치는 퇴사 기록이 있어요. 같은 사람인지 확인하고 선택해주세요. 기존 기록을 연결하면 과거 급여 이력도 본인에게 보여요.</Text>}
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
              {!preserved && <Text style={styles.body}>{profile ? '직원이 제출한 내용을 확인하고 필요한 항목을 수정해주세요.' : '근무 정보가 아직 없어요. 직원에게 확인한 내용을 입력해주세요.'}</Text>}
              {!preserved && <JoinOnboardingFields admin disabled={busy} value={draft} onChange={setDraft} />}
              {!preserved && !!accountNote && <Text style={styles.body}>{accountNote}</Text>}
              {!!preserved && <Text style={styles.body}>기존 직원 정보와 급여 조건을 유지하고 계정만 연결해요. 새 내용을 적용하려면 기존 급여 선택을 해제해주세요.</Text>}
              {candidates.length > 0 && !preserved && <Text style={styles.body}>기존 직원에 연결하면 현재 조건은 위 내용으로 바뀌고, 급여 조건 이력은 오늘부터 추가돼요. 이미 작성된 급여 내역은 유지돼요.</Text>}
            {!retiredOnly && <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: cannotApprove }} disabled={cannotApprove} style={[styles.button, cannotApprove && styles.disabled]} onPress={() => choose({ kind: 'auto' })}><Text style={styles.buttonText}>최종 합류</Text></TouchableOpacity>}
            {retiredOnly && <>
            {candidates.map((e, index) => {
              const blocked = e.has_other_account || (hasApplicantRecord && !e.is_applicant_account);
              const usingExisting = preserved?.id === e.id;
              const disabled = busy || blocked || (usingExisting ? false : cannotApprove);
              return (
                <View key={e.id} style={styles.card}>
                  <Text style={styles.name}>{e.name} · 퇴사</Text>
                  <Text style={styles.body}>{e.phone || '연락처 없음'}</Text>
                  <Text style={styles.body}>입사일 {e.joined_at || '미등록'} · 등록일 {e.created_at.slice(0, 10)}</Text>
                  <Text style={styles.body}>퇴사 기록 {index + 1}</Text>
                  {e.existing_wage && <Text style={styles.body}>기존 {e.existing_wage.employment_type === 'part_time' ? `시급 ${Number(e.existing_wage.hourly_wage).toLocaleString('ko-KR')}원` : `월급 ${Number(e.existing_wage.base_salary).toLocaleString('ko-KR')}원`} · {e.existing_wage.effective_date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) => `${y}년 ${Number(m)}월 ${Number(d)}일부터`)}</Text>}
                  {canPreserve(e) ? <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={`${e.name}님의 기존 급여 그대로`} accessibilityState={{ checked: usingExisting, disabled: busy }} disabled={busy} style={styles.cancel} onPress={() => setPreserve(usingExisting ? null : { memberId: member.id, employeeId: e.id, historyId: e.wage_history_id! })}><Text style={styles.name}>기존 급여 그대로</Text></TouchableOpacity>
                    : !blocked && <Text style={styles.body}>유효한 급여 조건이 없어요. 위에서 급여를 입력해주세요.</Text>}
                  {e.has_other_account && <Text style={styles.body}>다른 계정에 연결되어 있어 선택할 수 없어요.</Text>}
                  {!e.has_other_account && blocked && <Text style={styles.body}>신청 계정에 이미 연결된 기록을 선택해주세요.</Text>}
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${e.name}, 입사일 ${e.joined_at || '미등록'}, 등록일 ${e.created_at.slice(0, 10)}, 이 직원으로 최종 합류`} accessibilityState={{ disabled }} disabled={disabled} style={[styles.button, disabled && styles.disabled]} onPress={() => choose({ kind: 'rehire', employeeId: e.id })}>
                    <Text style={styles.buttonText}>이 직원으로 최종 합류</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <View style={styles.card}>
              <Text style={styles.name}>위 직원들과 다른 사람이에요</Text>
              <Text style={styles.body}>기존 퇴사 기록은 유지하고, 신청 정보로 새 직원을 등록해요. 급여 내역은 생성하지 않아요.</Text>
              {hasApplicantRecord && <Text style={styles.body}>신청 계정에 연결된 과거 기록이 있어 신규 등록할 수 없어요.</Text>}
              <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: cannotApprove || hasApplicantRecord }} disabled={cannotApprove || hasApplicantRecord} style={[styles.button, (cannotApprove || hasApplicantRecord) && styles.disabled]} onPress={() => choose({ kind: 'new' })}>
                <Text style={styles.buttonText}>새 직원으로 최종 합류</Text>
              </TouchableOpacity>
            </View>
            </>}
          </ScrollView>
          <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.cancel} onPress={onClose}><Text style={styles.name}>취소</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: Colors.white, borderRadius: 24, padding: 20, maxHeight: '85%' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.black, marginBottom: 12 },
  body: { fontSize: 13, color: Colors.gray600, lineHeight: 20, marginBottom: 8 },
  name: { fontSize: 14, fontWeight: '600', color: Colors.black, marginBottom: 6 },
  list: { flexShrink: 1 },
  card: { padding: 16, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 20, marginTop: 12 },
  button: { minHeight: 44, justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 12, padding: 12, alignItems: 'center' },
  buttonText: { color: Colors.white, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  cancel: { padding: 14, alignItems: 'center' },
});
