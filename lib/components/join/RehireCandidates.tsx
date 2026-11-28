/* design-system: DESIGN.md — 합류 승인: 이름·연락처가 겹치는 퇴사 기록(재합류·기존 조건 유지). 기존 흐름과 문구를 보존한다. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Radius, Type } from '../../../constants/designTokens';
import type { MemberApprovalCandidate } from '../../../types';

export interface RehireCandidatesProps {
  candidates: MemberApprovalCandidate[];
  busy: boolean;
  cannotApprove: boolean;
  hasApplicantRecord: boolean;
  preservedId: string | null;
  canPreserve: (candidate: MemberApprovalCandidate) => boolean;
  onTogglePreserve: (candidate: MemberApprovalCandidate) => void;
  onRehire: (employeeId: string) => void;
  onNew: () => void;
}

const wageLine = (e: MemberApprovalCandidate) => e.existing_wage && `기존 ${e.existing_wage.employment_type === 'part_time'
  ? `시급 ${Number(e.existing_wage.hourly_wage).toLocaleString('ko-KR')}원`
  : `월급 ${Number(e.existing_wage.base_salary).toLocaleString('ko-KR')}원`} · ${e.existing_wage.effective_date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) => `${y}년 ${Number(m)}월 ${Number(d)}일부터`)}`;

export function RehireCandidates({ candidates, busy, cannotApprove, hasApplicantRecord, preservedId, canPreserve, onTogglePreserve, onRehire, onNew }: RehireCandidatesProps) {
  return <View style={styles.wrap}>
    <Text style={styles.body}>이름이나 연락처가 겹치는 퇴사 기록이 있어요. 같은 사람인지 확인하고 선택해주세요. 기존 기록을 연결하면 과거 급여 이력도 본인에게 보여요.</Text>
    {candidates.map((e, index) => {
      const blocked = e.has_other_account || (hasApplicantRecord && !e.is_applicant_account);
      const usingExisting = preservedId === e.id;
      const disabled = busy || blocked || (usingExisting ? false : cannotApprove);
      return <View key={e.id} style={styles.card}>
        <Text style={styles.name}>{e.name} · 퇴사</Text>
        <Text style={styles.body}>{e.phone || '연락처 없음'}</Text>
        <Text style={styles.body}>입사일 {e.joined_at || '미등록'} · 등록일 {e.created_at.slice(0, 10)}</Text>
        <Text style={styles.body}>퇴사 기록 {index + 1}</Text>
        {!!wageLine(e) && <Text style={styles.body}>{wageLine(e)}</Text>}
        {canPreserve(e) ? <Pressable accessibilityRole="checkbox" accessibilityLabel={`${e.name}님의 기존 급여 그대로`}
          accessibilityState={{ checked: usingExisting, disabled: busy }} disabled={busy} onPress={() => onTogglePreserve(e)}
          style={[styles.toggle, usingExisting && styles.toggleOn]}>
          <Text style={[styles.toggleText, usingExisting && styles.toggleTextOn]}>기존 급여 그대로</Text>
        </Pressable> : !blocked && <Text style={styles.body}>유효한 급여 조건이 없어요. 위에서 급여를 입력해주세요.</Text>}
        {e.has_other_account && <Text style={styles.body}>다른 계정에 연결되어 있어 선택할 수 없어요.</Text>}
        {!e.has_other_account && blocked && <Text style={styles.body}>신청 계정에 이미 연결된 기록을 선택해주세요.</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={`${e.name}, 입사일 ${e.joined_at || '미등록'}, 등록일 ${e.created_at.slice(0, 10)}, 이 직원으로 최종 합류`}
          accessibilityState={{ disabled }} disabled={disabled} onPress={() => onRehire(e.id)} style={[styles.button, disabled && styles.disabled]}>
          <Text style={styles.buttonText}>이 직원으로 최종 합류</Text>
        </Pressable>
      </View>;
    })}
    <View style={styles.card}>
      <Text style={styles.name}>위 직원들과 다른 사람이에요</Text>
      <Text style={styles.body}>기존 퇴사 기록은 유지하고, 신청 정보로 새 직원을 등록해요. 급여 내역은 생성하지 않아요.</Text>
      {hasApplicantRecord && <Text style={styles.body}>신청 계정에 연결된 과거 기록이 있어 신규 등록할 수 없어요.</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: cannotApprove || hasApplicantRecord }} disabled={cannotApprove || hasApplicantRecord}
        onPress={onNew} style={[styles.button, (cannotApprove || hasApplicantRecord) && styles.disabled]}>
        <Text style={styles.buttonText}>새 직원으로 최종 합류</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24, gap: 12 },
  card: { padding: 16, borderWidth: 1, borderColor: Colors.gray200, borderRadius: Radius.xl, gap: 2 },
  name: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.base, color: Colors.black, marginBottom: 4 },
  body: { fontFamily: Fonts.wantedRegular, fontSize: Type.sm, lineHeight: 20, color: Colors.gray600 },
  toggle: { minHeight: 44, borderRadius: Radius.md, backgroundColor: Colors.chipBg, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  toggleOn: { backgroundColor: Colors.bg },
  toggleText: { fontFamily: Fonts.wantedMedium, fontSize: Type.base, color: Colors.gray700 },
  toggleTextOn: { fontFamily: Fonts.wantedSemiBold, color: Colors.action },
  button: { minHeight: 48, borderRadius: Radius.md, backgroundColor: Colors.action, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.base, color: Colors.white },
  disabled: { opacity: 0.4 },
});
