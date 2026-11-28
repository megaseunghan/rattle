/* design-system: DESIGN.md — S54 일용근로자 추가·고치기. 합류 없이 매장이 직접 적는다(이름·연락처·평일/주말 일당·급여 계좌). */
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Type } from '../../../constants/designTokens';
import { AppIcon } from '../../icons/AppIcon';
import { maskedAccount } from '../../services/accountNumbers';
import type { DailyLaborerInput } from '../../services/dailyLaborers';
import { BankGrid } from '../pickers';
import { Button } from '../ui/Button';
import { LaborSheet } from './LaborSheet';
import { AmountInput, GrayNote, SectionLabel, TextBox } from './parts';
import type { DailyLaborer } from '../../../types';

interface Draft { name: string; phone: string; weekday: number | null; weekend: number | null; bank: string; account: string }

interface LaborerSheetProps {
  /** null이면 닫힘, { target: undefined }면 새로 추가 */
  open: { target?: DailyLaborer } | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: DailyLaborerInput, previous?: DailyLaborer) => void;
  onToggleActive: (laborer: DailyLaborer) => void;
}

function draftOf(target?: DailyLaborer): Draft {
  return { name: target?.name ?? '', phone: target?.phone ?? '', weekday: target?.weekday_wage ?? null, weekend: target?.weekend_wage ?? null,
    bank: target?.bank_name ?? '', account: '' };
}

/** 부모가 key로 다시 만들어 열 때마다 새 입력으로 시작한다. 닫히는 동안은 마지막 내용을 보여 준다. */
export function LaborerSheet({ open, saving, onClose, onSave, onToggleActive }: LaborerSheetProps) {
  const last = useRef(open);
  if (open) last.current = open;
  const target = (open ?? last.current)?.target;
  const [initial] = useState(() => draftOf(target));
  const [draft, setDraft] = useState(initial);
  const [accountOpen, setAccountOpen] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const last4 = target?.account_last4;
  const accountSummary = draft.bank || last4 ? [draft.bank, draft.account ? `••••${draft.account.slice(-4)}` : maskedAccount(last4)].filter(Boolean).join(' ') : '아직 안 정했어요';

  function close() {
    if (saving) return;
    if (!dirty) { onClose(); return; }
    Alert.alert('입력한 내용을 버릴까요?', '저장하지 않은 내용은 사라져요.', [
      { text: '계속 입력', style: 'cancel' },
      { text: '버리기', style: 'destructive', onPress: onClose },
    ]);
  }

  function save() {
    onSave({ name: draft.name, phone: draft.phone, bank_name: draft.bank, account_number: draft.account,
      weekday_wage: draft.weekday, weekend_wage: draft.weekend }, target);
  }

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft(d => ({ ...d, [key]: value }));

  return (
    <LaborSheet visible={!!open} onClose={close} title={target ? '일용근로자 정보' : '일용근로자 추가'}
      footer={<>
        <Button label={!draft.name.trim() ? '이름을 입력해 주세요' : target ? '저장' : '추가하기'} onPress={save} disabled={!draft.name.trim()} loading={saving} />
        {target && <Button label={target.is_active ? '일 안 하는 사람으로 바꾸기' : '다시 일하는 사람으로 바꾸기'} variant="text"
          onPress={() => onToggleActive(target)} disabled={saving} />}
      </>}>
      <SectionLabel text="이름" />
      <TextBox label="이름" value={draft.name} onChange={set('name')} placeholder="홍길동" maxLength={50} />
      <SectionLabel text="휴대폰 번호" hint="선택" />
      <TextBox label="휴대폰 번호" value={draft.phone} onChange={set('phone')} placeholder="010-0000-0000" keyboardType="phone-pad" maxLength={20} />
      <SectionLabel text="평일 일당" />
      <AmountInput label="평일 일당" value={draft.weekday} onChange={set('weekday')} placeholder="130,000" />
      <SectionLabel text="주말 일당" hint="비우면 평일과 같아요" />
      <AmountInput label="주말 일당" value={draft.weekend} onChange={set('weekend')} placeholder="150,000" />
      <SectionLabel text="은행 · 계좌번호" hint="선택" />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: accountOpen }} accessibilityLabel={`급여 계좌, ${accountSummary}`}
        onPress={() => setAccountOpen(v => !v)} style={styles.row}>
        <Text style={styles.rowKey}>급여 계좌</Text>
        <Text style={[styles.rowValue, !(draft.bank || last4) && styles.rowEmpty]} numberOfLines={1}>{accountSummary}</Text>
        <AppIcon name={accountOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gray400} />
      </Pressable>
      {accountOpen && <View style={styles.account}>
        <BankGrid value={draft.bank} onChange={set('bank')} disabled={saving} />
        <TextBox label="계좌번호" value={draft.account} onChange={value => set('account')(value.replace(/[^\d-]/g, ''))} keyboardType="number-pad" maxLength={30}
          placeholder={last4 ? `${maskedAccount(last4)} · 바꿀 때만 입력` : '계좌번호(숫자만)'} />
      </View>}
      <GrayNote text="신고에 필요한 주민등록번호는 세무사에게 따로 전달해 주세요." />
    </LaborSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.hairline },
  rowKey: { fontSize: Type.md, fontWeight: '500', color: Colors.black },
  rowValue: { flex: 1, textAlign: 'right', fontSize: Type.base, fontWeight: '600', color: Colors.black },
  rowEmpty: { color: Colors.gray400, fontWeight: '500' },
  account: { gap: 12, paddingTop: 8 },
});
