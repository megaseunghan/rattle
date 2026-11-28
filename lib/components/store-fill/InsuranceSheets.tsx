import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StoreFillPatch } from '../../../types';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { NumericText } from '../ui/NumericText';
import { LoadingSpinner } from '../LoadingSpinner';
import type { StoreFillValues } from '../../utils/storeFill';
import type { IndustrialAccidentIndustry } from '../../services/industrialAccident';
import { FillSheet } from './FillSheet';
import { ChoiceList, SheetNote } from './FillParts';
import { HEADCOUNT_OPTIONS, INDUSTRY_HINTS, INDUSTRY_UNLISTED, INSURANCE_OPTIONS, type FillOption } from './storeFillCopy';

interface BaseProps {
  visible: boolean;
  values: StoreFillValues;
  saving: boolean;
  error: string | null;
  onClose: () => void;
}

export function HeadcountSheet({ visible, values, saving, error, onClose, onSave, reference }: BaseProps & {
  onSave: (patch: StoreFillPatch) => void; reference: number | null;
}) {
  return (
    <FillSheet visible={visible} onClose={onClose} title="상시 근로자가 5명 이상인가요?" description="파트타이머도 포함해서 세요.">
      {reference != null ? (
        <View style={styles.ref}>
          <Text style={styles.refText}>
            최근 한 달 출퇴근 기록으로 세면 하루 평균 <NumericText style={styles.refNum}>{reference}</NumericText>명이에요. 참고만 하고 사장님이 정해 주세요.
          </Text>
        </View>
      ) : null}
      <ChoiceList options={HEADCOUNT_OPTIONS} selected={values.headcount_class} disabled={saving}
        onSelect={value => onSave({ headcount_class: value })} />
      {error ? <SheetNote>{error}</SheetNote> : null}
    </FillSheet>
  );
}

export function InsuranceSheet({ visible, values, saving, error, onClose, onPick }: BaseProps & { onPick: (enrolled: boolean) => void }) {
  return (
    <FillSheet visible={visible} onClose={onClose} title="4대보험에 가입한 사업장인가요?">
      <ChoiceList options={INSURANCE_OPTIONS} selected={values.social_insurance_enrolled} disabled={saving} onSelect={onPick} />
      {error ? <SheetNote>{error}</SheetNote> : null}
    </FillSheet>
  );
}

export interface IndustrySheetProps extends BaseProps {
  industries: IndustrialAccidentIndustry[] | undefined;
  industriesLoading: boolean;
  industriesFailed: boolean;
  onRetryIndustries: () => void;
  /** INDUSTRY_UNLISTED면 '목록에 없어요' */
  selected: string | null;
  onPick: (code: string) => void;
}

/** 산재보험 업종. 서버 업종 표 + '목록에 없어요'. */
export function IndustrySheet(props: IndustrySheetProps) {
  const { visible, saving, error, onClose, industries, industriesLoading, industriesFailed, onRetryIndustries, selected, onPick } = props;
  const options: FillOption<string>[] = [
    ...(industries ?? []).filter(item => item.code !== INDUSTRY_UNLISTED)
      .map(item => ({ value: item.code, title: item.name, description: INDUSTRY_HINTS[item.code] })),
    { value: INDUSTRY_UNLISTED, title: '목록에 없어요' },
  ];
  return (
    <FillSheet visible={visible} onClose={onClose} title="어떤 업종인가요?">
      {industriesLoading ? <LoadingSpinner fullScreen={false} /> : null}
      {industriesFailed ? (
        <View style={styles.failed}>
          <Text style={styles.refText}>업종 목록을 불러오지 못했어요.</Text>
          <Pressable accessibilityRole="button" onPress={onRetryIndustries} style={styles.retry}>
            <Text style={styles.retryText}>다시 불러오기</Text>
          </Pressable>
        </View>
      ) : null}
      {!industriesLoading && !industriesFailed ? (
        <ChoiceList options={options} selected={selected} disabled={saving} onSelect={onPick} />
      ) : null}
      {error ? <SheetNote>{error}</SheetNote> : null}
    </FillSheet>
  );
}

const styles = StyleSheet.create({
  ref: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.gray50 },
  refText: { fontFamily: Fonts.wantedRegular, fontSize: 13, lineHeight: 21, color: Colors.gray600 },
  refNum: { fontWeight: '600', color: Colors.black },
  failed: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.gray50, gap: 4 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  retryText: { fontFamily: Fonts.wantedSemiBold, fontSize: 14, color: Colors.action },
});
