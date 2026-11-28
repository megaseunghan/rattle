import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { isStoreFillGroupDone, type StoreFillValues } from '../../utils/storeFill';
import { dayLabel, describePaySchedule, paydayRowLabel } from '../../utils/payday';
import { FillRow } from './FillParts';
import {
  ENTITY_OPTIONS, HEADCOUNT_OPTIONS, HOLIDAY_OPTIONS, INDUSTRY_UNLISTED, INSURANCE_OPTIONS, VAT_OPTIONS, optionTitle,
} from './storeFillCopy';

export type FillSheetKind = 'close' | 'pay' | 'holiday' | 'headcount' | 'business' | 'bizNumber' | 'insurance' | 'industry';

export interface StoreFillGroupsProps {
  values: StoreFillValues;
  readOnly: boolean;
  /** 산재 업종 이름. '목록에 없어요'를 고른 경우도 여기서 받는다. */
  industryLabel: string | null;
  onOpen: (sheet: FillSheetKind) => void;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

/** 마저 채우기 4묶음(급여 날짜·직원 수·사업자·4대보험). */
export function StoreFillGroups({ values, readOnly, industryLabel, onOpen }: StoreFillGroupsProps) {
  const paydayDone = isStoreFillGroupDone('payday', values);
  const close = values.payroll_close_day;
  const payDay = values.payday_day;
  const offset = values.payday_month_offset;
  const payLabel = payDay != null && offset != null ? paydayRowLabel(offset, payDay) : null;
  const businessLabel = values.business_entity_type && values.vat_type
    ? `${optionTitle(ENTITY_OPTIONS, values.business_entity_type)} · ${optionTitle(VAT_OPTIONS, values.vat_type)}` : null;
  const row = (sheet: FillSheetKind) => (readOnly ? undefined : () => onOpen(sheet));
  return (
    <>
      <Group title="급여 날짜">
        <FillRow label="매월 마감일" value={close != null ? dayLabel(close) : null} readOnly={readOnly} onPress={row('close')} />
        <FillRow label="지급일" value={payLabel} readOnly={readOnly} onPress={row('pay')} />
        <FillRow label="지급일이 쉬는 날이면" value={paydayDone ? optionTitle(HOLIDAY_OPTIONS, values.payday_holiday_rule ?? 'before') : null}
          readOnly={readOnly} onPress={row('holiday')} />
        {paydayDone && close != null && payDay != null && offset != null
          ? <Text style={styles.note}>{describePaySchedule(close, offset, payDay)}</Text> : null}
      </Group>
      <Group title="직원 수">
        <FillRow label="상시 근로자" value={optionTitle(HEADCOUNT_OPTIONS, values.headcount_class)} readOnly={readOnly} onPress={row('headcount')} />
      </Group>
      <Group title="사업자">
        <FillRow label="사업자 유형" value={businessLabel} readOnly={readOnly} onPress={row('business')} />
        <FillRow label="사업자번호" optional value={values.business_number || null} readOnly={readOnly} onPress={row('bizNumber')} />
      </Group>
      <Group title="4대보험">
        <FillRow label="4대보험 가입" value={optionTitle(INSURANCE_OPTIONS, values.social_insurance_enrolled)} readOnly={readOnly} onPress={row('insurance')} />
        {values.social_insurance_enrolled === true
          ? <FillRow label="산재보험 업종" value={industryLabel} readOnly={readOnly} onPress={row('industry')} /> : null}
        {values.social_insurance_enrolled === true && values.industrial_accident_industry === INDUSTRY_UNLISTED
          ? <Text style={styles.note}>목록에 없는 업종이면 손익에 산재보험을 넣지 않아요.</Text> : null}
      </Group>
    </>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: 28 },
  groupTitle: { fontFamily: Fonts.wantedSemiBold, fontSize: 13, color: Colors.gray500, marginBottom: 2 },
  note: { fontFamily: Fonts.wantedRegular, fontSize: 12, lineHeight: 19, color: Colors.gray500, marginTop: 10 },
});
