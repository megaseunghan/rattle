/* design-system: DESIGN.md — 합류 승인·직원 정보에서 줄을 누르면 올라오는 항목별 시트. 각 시트는 열릴 때 현재 값으로 다시 채운다. */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInputProps, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Type } from '../../../constants/designTokens';
import { BankGrid, DateWheel, DurationWheel, formatDuration, formatKoreanDate } from '../pickers';
import { ChoiceList, type ChoiceOption } from './ChoiceList';
import { FieldSheet } from './FieldSheet';
import { formatMoneyInput, UnderlineInput } from './UnderlineInput';

interface BaseSheet { visible: boolean; onClose: () => void; busy?: boolean }

/** 보기를 누르면 바로 정해지는 시트(근무 형태·계약·주휴수당·소득 구분). */
export function ChoiceSheet<T extends string>({ visible, onClose, title, subtitle, options, selected, onPick, busy }: BaseSheet & {
  title: string; subtitle?: string; options: readonly ChoiceOption<T>[]; selected: T | null; onPick: (value: T) => void;
}) {
  return <FieldSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} busy={busy}>
    <ChoiceList label={title} options={options} selected={selected} onSelect={onPick} disabled={busy} />
  </FieldSheet>;
}

export interface TextField {
  key: string;
  label: string;
  /** 첫 칸이 아니면 입력칸 위에 작은 이름표 */
  caption?: string;
  value: string;
  money?: boolean;
  placeholder?: string;
  keyboardType?: TextInputProps['keyboardType'];
  maxLength?: number;
}

/** 한두 칸 입력 시트(시급, 월 급여 + 비과세, 이름, 휴대폰 번호). */
export function TextSheet({ visible, onClose, title, subtitle, fields, onConfirm, validate, confirmLabel, busy, children }: BaseSheet & {
  title: string; subtitle?: string; fields: TextField[]; confirmLabel?: string;
  onConfirm: (values: Record<string, string>) => void;
  /** 오류 문구를 돌려주면 확인을 막고 아래에 보여 준다. */
  validate?: (values: Record<string, string>) => string | null;
  children?: (values: Record<string, string>) => React.ReactNode;
}) {
  const initial = () => Object.fromEntries(fields.map(field => [field.key, field.money ? formatMoneyInput(field.value) : field.value]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  useEffect(() => { if (visible) setValues(initial()); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const error = validate?.(values) ?? null;
  return <FieldSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} busy={busy}
    confirmLabel={confirmLabel} confirmDisabled={!!error} onConfirm={() => { if (!error) onConfirm(values); }}>
    {fields.map((field, index) => <View key={field.key} style={index > 0 && styles.next}>
      {!!field.caption && <Text style={styles.caption}>{field.caption}</Text>}
      <UnderlineInput label={field.label} value={values[field.key] ?? ''} unit={field.money ? '원' : undefined} numeric={field.money}
        placeholder={field.placeholder} keyboardType={field.money ? 'number-pad' : field.keyboardType} maxLength={field.maxLength}
        editable={!busy} onChangeText={text => setValues(current => ({ ...current, [field.key]: field.money ? formatMoneyInput(text) : text }))} />
    </View>)}
    {children?.(values)}
    {!!error && Object.values(values).some(value => value.trim()) && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
  </FieldSheet>;
}

/** 입사일 시트(년·월·일 휠). */
export function DateSheet({ visible, onClose, title, subtitle, value, fallback, onConfirm, busy }: BaseSheet & {
  title: string; subtitle?: string; value: string; fallback: string; onConfirm: (iso: string) => void;
}) {
  const [date, setDate] = useState(value || fallback);
  const [moving, setMoving] = useState(false);
  useEffect(() => { if (visible) setDate(value || fallback); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  return <FieldSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} busy={busy} scrollEnabled={!moving}
    onConfirm={() => onConfirm(date)} confirmDisabled={moving}>
    <DateWheel value={date} fallback={fallback} onChange={setDate} onMoving={setMoving} disabled={busy}
      caption={`${formatKoreanDate(date)}부터 일해요.`} />
  </FieldSheet>;
}

/** 주 근무시간 시트(시간 + 분 휠). */
export function DurationSheet({ visible, onClose, value, onConfirm, busy }: BaseSheet & { value: number | null; onConfirm: (minutes: number) => void }) {
  const [minutes, setMinutes] = useState(value ?? 20 * 60);
  const [moving, setMoving] = useState(false);
  useEffect(() => { if (visible) setMinutes(value ?? 20 * 60); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  return <FieldSheet visible={visible} onClose={onClose} title="주 근무시간" busy={busy} scrollEnabled={!moving}
    onConfirm={() => onConfirm(minutes)} confirmDisabled={moving || minutes <= 0}>
    <DurationWheel value={minutes} onChange={setMinutes} onMoving={setMoving} disabled={busy}
      caption={minutes > 0 ? `일주일에 ${formatDuration(minutes)} 일해요.` : '근무시간을 골라 주세요.'} />
  </FieldSheet>;
}

/**
 * 급여 계좌 시트(화면 높이까지 은행 버튼 + 계좌번호).
 * keepCurrent: 직원 정보처럼 지금 번호를 끝 4자리로만 알 때. 계좌번호를 비우면 지금 번호를 그대로 둔다.
 */
export function AccountSheet({ visible, onClose, bankName, accountNumber, currentLast4, onConfirm, busy }: BaseSheet & {
  bankName: string; accountNumber: string; currentLast4?: string | null;
  onConfirm: (value: { bankName: string; accountNumber: string }) => void;
}) {
  const [bank, setBank] = useState(bankName);
  const [account, setAccount] = useState(accountNumber);
  // 다시 열 때 은행 버튼(직접 입력 여부)도 새 값으로 그린다.
  const [session, setSession] = useState(0);
  useEffect(() => { if (visible) { setBank(bankName); setAccount(accountNumber); setSession(value => value + 1); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const digits = account.replace(/[- ]/g, '');
  const keepCurrent = currentLast4 !== undefined && !digits;
  const accountError = keepCurrent ? null : !/^\d{6,30}$/.test(digits) ? '계좌번호를 숫자 6~30자리로 입력해 주세요.' : null;
  const bankError = !bank.trim() ? '은행을 골라 주세요.' : null;
  return <FieldSheet visible={visible} onClose={onClose} title="급여 계좌" tall busy={busy}
    onConfirm={() => { if (!accountError && !bankError) onConfirm({ bankName: bank.trim(), accountNumber: digits }); }}
    confirmDisabled={!!accountError || !!bankError}>
    <BankGrid key={session} value={bank} onChange={setBank} disabled={busy} />
    <Text style={[styles.caption, styles.accountCaption]}>계좌번호</Text>
    <UnderlineInput label={currentLast4 !== undefined ? '새 계좌번호' : '계좌번호'} value={account} numeric keyboardType="number-pad" maxLength={40}
      editable={!busy} onChangeText={text => setAccount(text.replace(/[^\d-]/g, ''))}
      placeholder={currentLast4 ? `지금 ····${currentLast4} · 바꿀 때만 입력` : '계좌번호'} />
    {!!digits && !!accountError && <Text style={styles.error} accessibilityRole="alert">{accountError}</Text>}
  </FieldSheet>;
}

const styles = StyleSheet.create({
  next: { marginTop: 18 },
  caption: { fontFamily: Fonts.wantedMedium, fontSize: Type.sm, color: Colors.gray600, marginBottom: 2 },
  accountCaption: { marginTop: 22 },
  error: { marginTop: 10, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, lineHeight: 20, color: Colors.negative },
});
