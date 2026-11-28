import { useEffect, useState } from 'react';
import type { StoreFillPatch } from '../../../types';
import type { StoreFillValues } from '../../utils/storeFill';
import { isSameMonthPayAllowed, normalizeMonthOffset } from '../../utils/payday';
import { FillSheet } from './FillSheet';
import { ChoiceList, DayGrid, Segment, SheetNote } from './FillParts';
import { HOLIDAY_OPTIONS, type FillOption } from './storeFillCopy';

const OFFSET_OPTIONS: FillOption<0 | 1>[] = [{ value: 0, title: '같은 달' }, { value: 1, title: '다음 달' }];
const DAY_NOTE = "30·31일이 없는 달이 있어서 그 무렵이면 '말일'을 골라 주세요.";

export interface PaydaySheetProps {
  visible: boolean;
  values: StoreFillValues;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (patch: StoreFillPatch) => void;
}

/** 마감일. 이미 '같은 달' 지급인데 새 마감일로 안 맞으면 다음 달로 같이 고친다. */
export function closeDayPatch(values: StoreFillValues, day: number): StoreFillPatch {
  const { payday_day: payDay, payday_month_offset: offset } = values;
  if (payDay != null && offset === 0 && !isSameMonthPayAllowed(day, payDay)) {
    return { payroll_close_day: day, payday_month_offset: 1 };
  }
  return { payroll_close_day: day };
}

/** 지급일. 쉬는 날 규칙을 아직 안 정했으면 기본 '앞당겨서'로 함께 저장한다. */
export function payDayPatch(values: StoreFillValues, day: number, offset: 0 | 1): StoreFillPatch {
  const close = values.payroll_close_day;
  return {
    payday_day: day,
    payday_month_offset: close == null ? offset : normalizeMonthOffset(close, day, offset),
    ...(values.payday_holiday_rule == null ? { payday_holiday_rule: 'before' as const } : {}),
  };
}

export function CloseDaySheet({ visible, values, saving, error, onClose, onSave }: PaydaySheetProps) {
  return (
    <FillSheet visible={visible} onClose={onClose} title="매월 며칠에 마감하나요?">
      <DayGrid selected={values.payroll_close_day} isDisabled={() => saving} onSelect={day => onSave(closeDayPatch(values, day))} />
      <SheetNote>{DAY_NOTE}</SheetNote>
      {error ? <SheetNote>{error}</SheetNote> : null}
    </FillSheet>
  );
}

function defaultOffset(values: StoreFillValues): 0 | 1 {
  if (values.payday_month_offset != null) return values.payday_month_offset;
  return 1;
}

export function PayDaySheet({ visible, values, saving, error, onClose, onSave }: PaydaySheetProps) {
  const close = values.payroll_close_day;
  const [offset, setOffset] = useState<0 | 1>(defaultOffset(values));
  useEffect(() => { if (visible) setOffset(defaultOffset(values)); }, [visible, values]);
  const sameMonthPossible = close == null || isSameMonthPayAllowed(close, null);
  const dayDisabled = (day: number) => saving || (offset === 0 && close != null && !isSameMonthPayAllowed(close, day));
  return (
    <FillSheet visible={visible} onClose={onClose} title="며칠에 주나요?"
      description={sameMonthPossible ? '마감한 달에 주는지, 그다음 달에 주는지 골라 주세요.' : '말일에 마감하면 다음 달에 줘요.'}>
      <Segment options={OFFSET_OPTIONS} selected={offset} onSelect={setOffset} isDisabled={value => value === 0 && !sameMonthPossible} />
      <DayGrid selected={values.payday_month_offset === offset ? values.payday_day : null} isDisabled={dayDisabled}
        onSelect={day => onSave(payDayPatch(values, day, offset))} />
      <SheetNote>{offset === 0 && close != null ? '같은 달이면 마감일보다 뒤 날짜만 고를 수 있어요.' : DAY_NOTE}</SheetNote>
      {error ? <SheetNote>{error}</SheetNote> : null}
    </FillSheet>
  );
}

export function HolidaySheet({ visible, values, saving, error, onClose, onSave }: PaydaySheetProps) {
  return (
    <FillSheet visible={visible} onClose={onClose} title="지급일이 주말·공휴일이면">
      <ChoiceList options={HOLIDAY_OPTIONS} selected={values.payday_holiday_rule ?? 'before'} disabled={saving}
        onSelect={rule => onSave({ payday_holiday_rule: rule })} />
      {error ? <SheetNote>{error}</SheetNote> : null}
    </FillSheet>
  );
}
