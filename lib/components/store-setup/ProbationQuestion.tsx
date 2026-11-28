/* design-system: DESIGN.md — 수습 기간(없음·1·2·3개월) + 고르면 바로 아래 수습 중 급여 %(전체 폭 밑줄, 처음 90). */
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { ChoiceButtons, FlowNote, FlowSubLabel, UnderlineInput } from '../question-flow';
import { DEFAULT_RATE_TEXT } from './draft';
import { probationRateNote, sanitizeRateInput, type ProbationMonths } from './format';

const PERIOD_OPTIONS = [
  { value: '0', label: '없음', accessibilityLabel: '수습 없음' },
  { value: '1', label: '1개월' },
  { value: '2', label: '2개월' },
  { value: '3', label: '3개월' },
] as const;

/** Geist 숫자 한 글자 너비(20pt 기준 근삿값). 숫자 바로 뒤에 %가 붙도록 입력 폭을 글자 수에 맞춘다. */
const DIGIT_WIDTH = 13;

export interface ProbationQuestionProps {
  months: ProbationMonths;
  rateText: string;
  /** 예시 시급(그날 최저임금). 모르면 null. */
  exampleHourly: number | null;
  disabled: boolean;
  onMonthsChange: (months: ProbationMonths) => void;
  onRateChange: (rateText: string) => void;
}

export function ProbationQuestion({ months, rateText, exampleHourly, disabled, onMonthsChange, onRateChange }: ProbationQuestionProps) {
  return <View>
    <ChoiceButtons label="수습 기간" options={PERIOD_OPTIONS} value={String(months) as typeof PERIOD_OPTIONS[number]['value']}
      disabled={disabled} onChange={value => onMonthsChange(Number(value) as ProbationMonths)} />
    {months !== 0 && <RateField rateText={rateText} exampleHourly={exampleHourly} disabled={disabled} onChange={onRateChange} />}
  </View>;
}

function RateField({ rateText, exampleHourly, disabled, onChange }: { rateText: string; exampleHourly: number | null; disabled: boolean; onChange: (text: string) => void }) {
  const note = probationRateNote(rateText, exampleHourly);
  return <View>
    <FlowSubLabel>수습 중 급여는 몇 %로 줄까요?</FlowSubLabel>
    <View style={styles.field}>
      <UnderlineInput label="수습 중 급여 비율, 퍼센트" numeric value={rateText} editable={!disabled}
        onChangeText={text => onChange(sanitizeRateInput(text))} keyboardType="number-pad" maxLength={3}
        selectTextOnFocus returnKeyType="done"
        inputStyle={[styles.input, { width: Math.max(rateText.length, 1) * DIGIT_WIDTH + 4 }]}
        suffix={<Text style={styles.unit} accessible={false}>%</Text>}
        trailing={rateText === DEFAULT_RATE_TEXT ? <Text style={styles.default}>기본값</Text> : null} />
    </View>
    <FlowNote>{note.text}{note.strong ? <Text style={styles.strong}>{note.strong}</Text> : null}{note.tail ?? ''}</FlowNote>
  </View>;
}

const styles = StyleSheet.create({
  field: { marginTop: -8 },
  input: { flex: 0, minWidth: DIGIT_WIDTH },
  unit: { fontFamily: Fonts.geistSemiBold, fontSize: 18, color: Colors.gray600, marginLeft: 4 },
  default: { fontSize: 13, fontWeight: '500', color: Colors.gray500 },
  strong: { fontWeight: '600', color: Colors.gray600 },
});
