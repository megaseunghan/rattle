/* design-system: DESIGN.md — S54 하루 근무 기록(추가·고치기)과 지급 완료 기록 보기. 주말은 날짜로 정하고 고칠 수 있다. */
import { useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { isWeekend } from '../../payroll';
import { calculateDailyLaborEntry, kindDailyWage, type DailyLaborEntryInput } from '../../services/dailyLaborers';
import { getErrorMessage } from '../../utils/error';
import { Button } from '../ui/Button';
import { DayStrip } from './DayStrip';
import { LaborSheet } from './LaborSheet';
import { dayLabel, won } from './format';
import { AmountInput, AmountLine, GrayNote, SectionLabel, Segment, TextBox } from './parts';
import type { DailyLaborEntry, DailyLaborer } from '../../../types';

export type EntrySheetMode =
  | { kind: 'add'; laborer: DailyLaborer; yearMonth: string; usedDates: ReadonlySet<string> }
  | { kind: 'edit'; laborer: DailyLaborer; entry: DailyLaborEntry }
  | { kind: 'paid'; laborer: DailyLaborer; entry: DailyLaborEntry };

type Preview = { ok: ReturnType<typeof calculateDailyLaborEntry> } | { error: string };
interface Draft { date: string | null; weekend: boolean; wage: number | null; extra: number | null; memo: string }

interface EntrySheetProps {
  mode: EntrySheetMode | null;
  today: string;
  saving: boolean;
  onClose: () => void;
  onSave: (input: DailyLaborEntryInput, previous?: DailyLaborEntry) => void;
  onDelete: (entry: DailyLaborEntry) => void;
  onShowPayment: (paymentId: string) => void;
}

function initialDraft(mode: EntrySheetMode, today: string): Draft {
  if (mode.kind !== 'add') {
    const { entry } = mode;
    return { date: entry.work_date, weekend: entry.is_weekend, wage: entry.daily_wage, extra: entry.extra_pay || null, memo: entry.memo ?? '' };
  }
  const date = today.startsWith(mode.yearMonth) && !mode.usedDates.has(today) ? today : null;
  const weekend = date ? isWeekend(date) : false;
  return { date, weekend, wage: kindDailyWage(mode.laborer, weekend), extra: null, memo: '' };
}

function wageLabel(prefix: string, value: number | null): string {
  return value == null ? prefix : `${prefix} ${won(value)}`;
}

type InnerProps<K> = Omit<EntrySheetProps, 'mode'> & { mode: K; visible: boolean };

/** 부모가 key로 다시 만들어 열 때마다 새 입력으로 시작한다. 닫히는 동안은 마지막 내용을 그대로 보여 준다. */
export function EntrySheet(props: EntrySheetProps) {
  const last = useRef(props.mode);
  if (props.mode) last.current = props.mode;
  const mode = props.mode ?? last.current;
  if (!mode) return null;
  const visible = !!props.mode;
  return mode.kind === 'paid'
    ? <PaidEntrySheet {...props} mode={mode} visible={visible} />
    : <EditableEntrySheet {...props} mode={mode} visible={visible} />;
}

function PaidEntrySheet({ mode, visible, onClose, onShowPayment }: InnerProps<Extract<EntrySheetMode, { kind: 'paid' }>>) {
  const { entry } = mode;
  return (
    <LaborSheet visible={visible} onClose={onClose} title={dayLabel(entry.work_date)}
      subtitle="지급 완료한 기록이라 금액을 고치거나 지울 수 없어요. 지급 대기로 되돌리면 고칠 수 있어요."
      footer={entry.payment_id ? <Button label="지급 내역 보기" variant="secondary" onPress={() => onShowPayment(entry.payment_id!)} /> : undefined}>
      <AmountLine label={entry.is_weekend ? '일당(주말)' : '일당(평일)'} amount={won(entry.daily_wage)} />
      <AmountLine label="추가 수당" amount={won(entry.extra_pay)} />
      {!!entry.memo && <GrayNote text={entry.memo} />}
    </LaborSheet>
  );
}

function EditableEntrySheet({ mode, visible, today, saving, onClose, onSave, onDelete }: InnerProps<Exclude<EntrySheetMode, { kind: 'paid' }>>) {
  const [initial] = useState(() => initialDraft(mode, today));
  const [draft, setDraft] = useState(initial);
  const { laborer } = mode;
  const previous = mode.kind === 'edit' ? mode.entry : undefined;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const preview = useMemo((): Preview | null => {
    if (!draft.date || draft.wage == null) return null;
    try {
      return { ok: calculateDailyLaborEntry({ laborer_id: laborer.id, work_date: draft.date, daily_wage: draft.wage, extra_pay: draft.extra ?? 0, is_weekend: draft.weekend }) };
    } catch (e) { return { error: getErrorMessage(e, '입력값을 확인해 주세요.') }; }
  }, [draft, laborer.id]);

  function close() {
    if (saving) return;
    if (!dirty) { onClose(); return; }
    Alert.alert('입력한 내용을 버릴까요?', '저장하지 않은 내용은 사라져요.', [
      { text: '계속 입력', style: 'cancel' },
      { text: '버리기', style: 'destructive', onPress: onClose },
    ]);
  }

  function chooseDate(date: string) {
    const weekend = isWeekend(date);
    setDraft(d => ({ ...d, date, weekend, wage: kindDailyWage(laborer, weekend) ?? d.wage }));
  }

  function chooseKind(kind: 'weekday' | 'weekend') {
    const weekend = kind === 'weekend';
    setDraft(d => ({ ...d, weekend, wage: kindDailyWage(laborer, weekend) ?? d.wage }));
  }

  function confirmDelete() {
    if (!previous) return;
    Alert.alert('근무 기록을 지울까요?', `${laborer.name}님 ${dayLabel(previous.work_date)} 기록을 지우면 되돌릴 수 없어요.`, [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => onDelete(previous) },
    ]);
  }

  function save() {
    if (!draft.date || draft.wage == null) return;
    onSave({ laborer_id: laborer.id, work_date: draft.date, is_weekend: draft.weekend, daily_wage: draft.wage, extra_pay: draft.extra ?? 0, memo: draft.memo }, previous);
  }

  const canSave = !!preview && 'ok' in preview;
  const label = !draft.date ? '날짜를 골라 주세요' : draft.wage == null ? '일당을 입력해 주세요'
    : previous ? '저장' : `${dayLabel(draft.date)} 기록하기`;

  return (
    <LaborSheet visible={visible} onClose={close} title={previous ? dayLabel(previous.work_date) : '근무 기록 추가'} subtitle={previous ? laborer.name : undefined}
      footer={<>
        <Button label={label} onPress={save} disabled={!canSave} loading={saving} />
        {previous && <Button label="기록 지우기" variant="text" onPress={confirmDelete} disabled={saving} />}
      </>}>
      {mode.kind === 'add' && <>
        <SectionLabel text="근무한 날" />
        <DayStrip yearMonth={mode.yearMonth} today={today} selected={draft.date} usedDates={mode.usedDates} onSelect={chooseDate} />
      </>}
      <SectionLabel text="일당" hint="주말은 날짜로 정해요. 다르면 눌러서 바꿔 주세요" />
      <Segment label="평일·주말" value={draft.weekend ? 'weekend' : 'weekday'} onChange={chooseKind}
        options={[{ value: 'weekday', label: wageLabel('평일', laborer.weekday_wage) }, { value: 'weekend', label: wageLabel('주말', kindDailyWage(laborer, true)) }]} />
      <AmountInput label="일당" value={draft.wage} onChange={wage => setDraft(d => ({ ...d, wage }))} placeholder="0" />
      <SectionLabel text="추가 수당" hint="선택" />
      <AmountInput label="추가 수당" value={draft.extra} onChange={extra => setDraft(d => ({ ...d, extra }))} placeholder="0" />
      <SectionLabel text="메모" hint="선택" />
      <TextBox label="메모" value={draft.memo} onChange={memo => setDraft(d => ({ ...d, memo }))} placeholder="예: 마감 연장" maxLength={500} />
      {preview && ('ok' in preview
        ? <GrayNote text={`하루 세전 ${won(preview.ok.daily_wage + preview.ok.extra_pay)}에서 고용보험 ${won(preview.ok.employment_insurance)}을 빼요. 소득세는 지급 완료로 바꿀 때 계산해요.`} />
        : <GrayNote text={preview.error} />)}
    </LaborSheet>
  );
}
