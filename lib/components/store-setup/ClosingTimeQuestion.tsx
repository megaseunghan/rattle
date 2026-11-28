/* design-system: DESIGN.md — 마감 시간: 닫는 시간이 있어요/24시간 영업해요 + 오전·오후·1~12시 휠(설정 '일 정산 시간'과 같은 휠). */
import { StyleSheet, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { ClosingTimeWheel } from '../ClosingTimeWheel';
import { ChoiceButtons, FlowNote } from '../question-flow';
import { closingNote, type Meridiem } from './format';

const MERIDIEMS: readonly Meridiem[] = ['오전', '오후'];
const HOURS = Array.from({ length: 12 }, (_, i) => `${i + 1}시`);
const MODE_OPTIONS = [
  { value: 'closes', label: '닫는 시간이 있어요' },
  { value: 'always', label: '24시간 영업해요' },
] as const;

export interface ClosingTimeQuestionProps {
  isOpen24h: boolean;
  meridiem: Meridiem;
  hour12: number;
  disabled: boolean;
  onOpen24hChange: (isOpen24h: boolean) => void;
  onTimeChange: (meridiem: Meridiem, hour12: number) => void;
  /** 휠이 움직이는 동안 true. 멈추기 전엔 '다음'을 막는다. */
  onMovingChange: (key: 'meridiem' | 'hour', moving: boolean) => void;
}

export function ClosingTimeQuestion({ isOpen24h, meridiem, hour12, disabled, onOpen24hChange, onTimeChange, onMovingChange }: ClosingTimeQuestionProps) {
  return <View>
    <ChoiceButtons label="영업 방식" options={MODE_OPTIONS} value={isOpen24h ? 'always' : 'closes'} disabled={disabled}
      onChange={mode => onOpen24hChange(mode === 'always')} />
    <View style={styles.wheels}>
      <View pointerEvents="none" style={styles.selection} />
      <ClosingTimeWheel label="오전 오후" options={MERIDIEMS} index={MERIDIEMS.indexOf(meridiem)} disabled={disabled}
        onChange={i => onTimeChange(MERIDIEMS[i], hour12)} onMoving={moving => onMovingChange('meridiem', moving)} />
      <ClosingTimeWheel label="시간" options={HOURS} index={hour12 - 1} disabled={disabled}
        onChange={i => onTimeChange(meridiem, i + 1)} onMoving={moving => onMovingChange('hour', moving)} />
    </View>
    <FlowNote>{closingNote(meridiem, hour12, isOpen24h)}</FlowNote>
  </View>;
}

const styles = StyleSheet.create({
  wheels: { flexDirection: 'row', gap: 8, marginTop: 16 },
  selection: { position: 'absolute', left: 0, right: 0, top: 68, height: 44, borderRadius: 12, backgroundColor: Colors.gray50 },
});
