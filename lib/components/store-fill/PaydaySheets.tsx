import type { StoreFillPatch } from '../../../types';
import type { StoreFillValues } from '../../utils/storeFill';
import { isSameMonthPayAllowed } from '../../utils/payday';
import { FillSheet } from './FillSheet';
import { ChoiceList, DayGrid, SheetNote } from './FillParts';
import { HOLIDAY_OPTIONS } from './storeFillCopy';

const DAY_NOTE = "30·31일이 없는 달이 있어서 그 무렵이면 '말일'을 골라 주세요.";

export interface PaydaySheetProps {
  visible: boolean;
  values: StoreFillValues;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (patch: StoreFillPatch) => void;
}

/**
 * 같은 달·다음 달은 고르지 않고 정한다(시안 fill-v5): 지급일이 마감일보다 뒤면 같은 달, 아니면(같거나 앞, 말일 마감) 다음 달.
 * 마감일을 아직 안 정했으면 다음 달로 두고, 마감일을 정할 때 다시 맞춘다.
 */
export function autoMonthOffset(closeDay: number | null, payDay: number): 0 | 1 {
  return closeDay != null && isSameMonthPayAllowed(closeDay, payDay) ? 0 : 1;
}

/** 마감일. 지급일이 이미 있으면 새 마감일 기준으로 같은 달·다음 달을 다시 맞춘다. */
export function closeDayPatch(values: StoreFillValues, day: number): StoreFillPatch {
  const { payday_day: payDay, payday_month_offset: offset } = values;
  if (payDay == null) return { payroll_close_day: day };
  const next = autoMonthOffset(day, payDay);
  return next === offset ? { payroll_close_day: day } : { payroll_close_day: day, payday_month_offset: next };
}

/** 지급일. 쉬는 날 규칙을 아직 안 정했으면 기본 '앞당겨서'로 함께 저장한다. */
export function payDayPatch(values: StoreFillValues, day: number): StoreFillPatch {
  return {
    payday_day: day,
    payday_month_offset: autoMonthOffset(values.payroll_close_day, day),
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

export function PayDaySheet({ visible, values, saving, error, onClose, onSave }: PaydaySheetProps) {
  return (
    <FillSheet visible={visible} onClose={onClose} title="며칠에 주나요?" description="마감일보다 앞 날짜면 다음 달로 봐요.">
      <DayGrid selected={values.payday_day} isDisabled={() => saving} onSelect={day => onSave(payDayPatch(values, day))} />
      <SheetNote>{DAY_NOTE}</SheetNote>
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
