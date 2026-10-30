import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Field } from './ui';
import { Colors } from '../../constants/colors';
import type { OnboardingDraft } from '../utils/joinOnboarding';
export function JoinOnboardingFields({ value, onChange, admin = false, disabled = false }: { admin?: boolean; disabled?: boolean; value: OnboardingDraft; onChange: (value: OnboardingDraft) => void }) {
  const set = (key: keyof OnboardingDraft, text: string) => onChange({ ...value, [key]: text });
  return <View style={styles.fields}>
    <Text style={styles.title}>근무 형태</Text>
    <View style={styles.types}>
      {([{ key: 'regular', label: '직원 · 월급제' }, { key: 'part_time', label: '파트타이머 · 시급제' }] as const).map(item =>
        <TouchableOpacity disabled={disabled} key={item.key} accessibilityRole="radio" accessibilityState={{ checked: value.employmentType === item.key }} style={[styles.type, value.employmentType === item.key && styles.selected]} onPress={() => set('employmentType', item.key)}><Text style={styles.typeLabel}>{item.label}</Text></TouchableOpacity>)}
    </View>
    {value.employmentType === 'part_time' ? <>
      <Field editable={!disabled} label="시급 (원)" accessibilityLabel="시급" placeholder="예: 12,000" keyboardType="number-pad" value={value.hourlyWage} onChangeText={text => set('hourlyWage', text)} maxLength={12} />
      <Field editable={!disabled} label="주 근무시간 (시간)" accessibilityLabel="주 근무시간" placeholder="예: 20" helpText="일주일에 예정된 근무시간을 정수로 입력해주세요." keyboardType="number-pad" value={value.weeklyHours} onChangeText={text => set('weeklyHours', text)} maxLength={3} />
    </> : <>
      <Field editable={!disabled} label="월 기본급 (세전·원)" accessibilityLabel="월 기본급" placeholder="예: 3,000,000" helpText="비과세를 포함한 월 세전 총액을 입력해주세요." keyboardType="number-pad" value={value.baseSalary} onChangeText={text => set('baseSalary', text)} maxLength={15} />
      <Field editable={!disabled} label="월 비과세 금액 (원)" accessibilityLabel="월 비과세 금액" placeholder="없으면 0" helpText="기본급에 포함된 비과세 금액이에요." keyboardType="number-pad" value={value.nonTaxable} onChangeText={text => set('nonTaxable', text)} maxLength={15} />
    </>}
    <Field editable={!disabled} label="입사일" accessibilityLabel="입사일" placeholder="YYYY-MM-DD" value={value.joinedAt} onChangeText={text => set('joinedAt', text)} keyboardType="numbers-and-punctuation" maxLength={10} />
    <Field editable={!disabled} label="은행" accessibilityLabel="은행" placeholder="예: 국민은행" value={value.bankName} onChangeText={text => set('bankName', text)} maxLength={50} />
    <Field editable={!disabled} label="급여 계좌번호" accessibilityLabel="급여 계좌번호" placeholder="본인 명의 계좌번호" helpText="하이픈 없이 입력해도 돼요. 급여 지급에 사용할 계좌예요." keyboardType="number-pad" value={value.accountNumber} onChangeText={text => set('accountNumber', text)} maxLength={40} />
    <Text style={styles.help}>{admin ? '최종 합류를 누르면 이 내용이 직원 정보와 급여 계산 기준에 반영돼요. 이미 작성된 급여 내역은 바꾸지 않아요.' : '입력한 내용은 신청 정보로 보관돼요. 매장 관리자가 확인·수정하고 최종 합류를 승인하면 반영돼요.'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  fields: { gap: 16 }, title: { fontSize: 14, fontWeight: '600', color: Colors.black },
  types: { flexDirection: 'row', gap: 8 }, type: { flex: 1, minHeight: 44, justifyContent: 'center', backgroundColor: Colors.white, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray200 },
  selected: { borderColor: Colors.primary, backgroundColor: Colors.tinted }, typeLabel: { fontSize: 13, color: Colors.black },
  help: { fontSize: 12, color: Colors.gray500, lineHeight: 18 },
});
