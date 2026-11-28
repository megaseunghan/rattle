/* design-system: DESIGN.md 「직원 정보 수정(S05)」 — 줄 + 아래 시트. 시트에서 확인하면 그 항목만 바로 저장하고 '저장했어요'를 보여 준다. */
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../icons/AppIcon';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Radius, Spacing, Type } from '../../../constants/designTokens';
import type { Employee, Store } from '../../../types';
import { getErrorMessage } from '../../utils/error';
import { InfoRow, RowGroup } from '../join/InfoRows';
import { GrayNotice } from '../join/GrayNotice';
import { choiceTitle, INCOME_CHOICES, WEEKLY_REST_CHOICES } from '../join/ChoiceList';
import { accountText, minimumWageMessage, probationText, wageCheckDate } from '../join/approvalValues';
import { koreanDate } from '../../utils/regularWages';
import { formatDuration, formatKoreanDate } from '../pickers';
import { EmployeeInfoSheets, type EmployeeSheetKey } from './EmployeeInfoSheets';
import type { WageChangeValue } from './EmployeeSheets';
import { showsDependents, weeklyMinutesOf, type EmployeePatch } from './employeeInfoValues';

export type EmployeeStoreDefaults = Pick<Store, 'default_probation_months' | 'default_probation_rate' | 'payroll_close_day'>;

export interface EmployeeInfoModalProps {
  employee: Employee;
  store?: EmployeeStoreDefaults | null;
  onClose: () => void;
  /** 한 항목 저장. 저장된 직원을 돌려주면 화면 값을 바로 바꾼다. */
  onSave: (patch: EmployeePatch) => Promise<Employee | void>;
  onChangeWage: (value: WageChangeValue) => Promise<void>;
  onReveal: () => Promise<string | null>;
  /** 없으면 직원 삭제를 보이지 않는다(권한). */
  onDeactivate?: () => Promise<void>;
}

const SAVED_TOAST_MS = 1800;

export function EmployeeInfoModal({ employee, store, onClose, onSave, onChangeWage, onReveal, onDeactivate }: EmployeeInfoModalProps) {
  const [current, setCurrent] = useState(employee);
  useEffect(() => { setCurrent(employee); }, [employee]);
  const [sheet, setSheet] = useState<EmployeeSheetKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => { if (mounted.current) setToast(null); }, SAVED_TOAST_MS);
  }
  async function run(action: () => Promise<void>, failTitle: string, fallback: string) {
    if (busy) return;
    setBusy(true);
    try { await action(); if (mounted.current) { setSheet(null); showToast('저장했어요'); } }
    catch (e) { if (mounted.current) Alert.alert(failTitle, getErrorMessage(e, fallback)); }
    finally { if (mounted.current) setBusy(false); }
  }
  const save = (patch: EmployeePatch) => run(async () => {
    const saved = await onSave(patch);
    // 저장 응답은 employees 원본 행이라 급여 열(현재 유효 이력 기준)은 화면 값을 유지한다.
    if (mounted.current) setCurrent(value => (saved ? { ...saved, base_salary: value.base_salary, hourly_wage: value.hourly_wage,
      non_taxable: value.non_taxable, wage_history_missing: value.wage_history_missing } : { ...value, ...patch }));
    if ('account_number' in patch) setRevealed(null);
  }, '저장하지 못했어요', '저장하지 못했어요. 다시 시도해 주세요.');
  const changeWage = (value: WageChangeValue) => run(async () => {
    try { await onChangeWage(value); }
    catch (e) { if (e instanceof Error && e.name === 'WageChangeOutcomeUnknownError' && mounted.current) setSheet(null); throw e; }
  }, '급여를 바꾸지 못했어요', '급여를 바꾸지 못했어요. 다시 시도해 주세요.');

  async function reveal() {
    if (revealed) { setRevealed(null); return; }
    try {
      const number = await onReveal();
      if (!mounted.current) return;
      if (number) setRevealed(number);
      else Alert.alert('계좌번호', '저장된 계좌번호가 없어요.');
    } catch (e) { if (mounted.current) Alert.alert('계좌번호', getErrorMessage(e, '계좌번호를 불러오지 못했어요. 다시 시도해 주세요.')); }
  }
  function confirmDeactivate() {
    if (!onDeactivate) return;
    Alert.alert('직원 삭제', `${current.name} 님을 직원 목록에서 뺄까요? 지난 급여 기록은 그대로 남아요.`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { void onDeactivate().then(onClose, e => Alert.alert('삭제하지 못했어요', getErrorMessage(e, '다시 시도해 주세요.'))); } },
    ]);
  }

  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!busy) onClose(); }}>
    {/* 모달은 별도 창이라 바깥 SafeAreaProvider 값을 받지 못한다. 안에서 다시 재야 닫기 버튼이 상태 표시줄을 피한다. */}
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <SafeAreaView style={styles.page} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" disabled={busy} onPress={onClose} style={styles.back}>
          <AppIcon name="chevron-back" size={24} color={Colors.black} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">{current.name}</Text>
        <Text style={styles.sub}>{current.user_id ? '합류한 계정이 연결돼 있어요.' : '연결된 계정이 없어요.'}</Text>
        <EmployeeRows employee={current} storeRate={store?.default_probation_rate ?? null} disabled={busy} onOpen={setSheet}
          revealed={revealed} onReveal={() => void reveal()} />
        {onDeactivate && <Pressable accessibilityRole="button" disabled={busy} onPress={confirmDeactivate} style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
          <Text style={styles.deleteText}>직원 삭제</Text>
        </Pressable>}
      </ScrollView>
      {!!toast && <View style={styles.toast} pointerEvents="none" accessibilityLiveRegion="polite" accessibilityRole="alert">
        <AppIcon name="checkmark-circle" size={18} color={Colors.white} /><Text style={styles.toastText}>{toast}</Text>
      </View>}
      <EmployeeInfoSheets sheet={sheet} employee={current} store={store} busy={busy} onClose={() => { if (!busy) setSheet(null); }}
        onSave={patch => void save(patch)} onChangeWage={value => void changeWage(value)} />
    </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}

function EmployeeRows({ employee, storeRate, disabled, onOpen, revealed, onReveal }: {
  employee: Employee; storeRate: number | null; disabled: boolean; onOpen: (sheet: EmployeeSheetKey) => void;
  revealed: string | null; onReveal: () => void;
}) {
  const part = employee.employment_type === 'part_time';
  const minutes = weeklyMinutesOf(employee);
  const minimum = minimumWageMessage({ isPart: part, hourly: part ? employee.hourly_wage : null, monthly: part ? null : employee.base_salary,
    weeklyMinutes: minutes, weeklyRestIncluded: employee.weekly_rest_included }, wageCheckDate(employee.joined_at ?? '', koreanDate()));
  const row = (label: string, value: string, sheet?: EmployeeSheetKey, numeric?: boolean) =>
    <InfoRow label={label} value={value || '아직 안 정했어요'} tone={value ? 'normal' : 'none'} numeric={numeric && !!value}
      disabled={disabled} onPress={sheet ? () => onOpen(sheet) : undefined} />;
  const won = (value: number | null | undefined) => value != null ? `${Number(value).toLocaleString('ko-KR')}원` : '';
  const rest = employee.weekly_rest_included == null ? '' : choiceTitle(WEEKLY_REST_CHOICES, employee.weekly_rest_included ? 'included' : 'separate');
  return <>
    <RowGroup title="기본">
      {row('이름', employee.name, 'name')}
      {row('휴대폰', employee.phone ?? '', 'phone')}
      {row('근무 형태', part ? '파트타이머' : '직원')}
    </RowGroup>
    <RowGroup title="급여">
      {part ? row('시급', won(employee.hourly_wage), 'wage', true) : row('월 기본급', won(employee.base_salary), 'wage', true)}
      {!!minimum && <GrayNotice message={minimum} />}
      {!part && row('월 비과세 금액', won(employee.non_taxable), undefined, true)}
      {part && row('주휴수당', rest, 'rest')}
      {part && row('주 근무시간', formatDuration(minutes), 'hours', true)}
      {row('입사일', employee.joined_at ? formatKoreanDate(employee.joined_at) : '', 'joined')}
    </RowGroup>
    <RowGroup title="세금">
      {row('소득 구분', choiceTitle(INCOME_CHOICES, employee.income_type ?? 'employee'), 'income')}
      {showsDependents(employee) && row('부양가족', `${employee.dependents}명`, 'dependents', true)}
    </RowGroup>
    <RowGroup title="수습">
      {row('수습 적용', probationText({ is_probation: employee.is_probation, probation_ends_on: employee.probation_ends_on, probation_rate: employee.probation_rate ?? null }, storeRate), 'probation')}
    </RowGroup>
    <RowGroup title="계좌">
      {row('급여 계좌', revealed ? `${employee.bank_name ?? ''} ${revealed}`.trim() : accountText(employee.bank_name ?? '', '', employee.account_last4), 'account')}
      {!!employee.account_last4 && <Pressable accessibilityRole="button" onPress={onReveal} disabled={disabled} style={({ pressed }) => [styles.reveal, pressed && styles.pressed]}>
        <Text style={styles.revealText}>{revealed ? '계좌 숨기기' : '계좌 보기'}</Text>
      </Pressable>}
    </RowGroup>
  </>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.white },
  top: { paddingHorizontal: 8, minHeight: 48, justifyContent: 'center' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.screenX, paddingBottom: 48 },
  title: { fontFamily: Fonts.wantedBold, fontSize: 24, lineHeight: 32, color: Colors.black },
  sub: { marginTop: 4, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray500 },
  reveal: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 },
  revealText: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.sm, color: Colors.action },
  delete: { marginTop: 32, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg, backgroundColor: Colors.chipBg },
  deleteText: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.base, color: Colors.negative },
  pressed: { opacity: 0.7 },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: Colors.gray900 },
  toastText: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.base, color: Colors.white },
});
