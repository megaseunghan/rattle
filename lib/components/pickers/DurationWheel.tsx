/* design-system: DESIGN.md — 시간 + 분(10분 단위) 휠. 주 근무시간 입력에 쓴다. */
import { Text, View } from 'react-native';
import { WheelColumn } from './WheelColumn';
import { wheelStyles as styles } from './DateWheel';
import { DURATION_MAX_HOURS, DURATION_MINUTE_STEPS, splitDuration } from './dateParts';

const HOURS = Array.from({ length: DURATION_MAX_HOURS + 1 }, (_, i) => String(i));
const MINUTES = DURATION_MINUTE_STEPS.map(String);

export interface DurationWheelProps {
  /** 분. null이면 fallbackMinutes를 보여 준다. */
  value: number | null;
  onChange: (minutes: number) => void;
  fallbackMinutes?: number;
  disabled?: boolean;
  onMoving?: (moving: boolean) => void;
  caption?: string;
}

export function DurationWheel({ value, onChange, fallbackMinutes = 20 * 60, disabled, onMoving, caption }: DurationWheelProps) {
  const { hours, minutes } = splitDuration(value ?? fallbackMinutes);
  return <View>
    <View style={styles.labels} importantForAccessibility="no-hide-descendants">
      {['시간', '분'].map(unit => <Text key={unit} style={styles.label}>{unit}</Text>)}
    </View>
    <View style={styles.wheel}>
      <View pointerEvents="none" style={styles.band} />
      <WheelColumn label="시간" unit="시간" options={HOURS} index={hours}
        onChange={i => onChange(i * 60 + minutes)} disabled={disabled} onMoving={onMoving} />
      <WheelColumn label="분" unit="분" options={MINUTES} index={DURATION_MINUTE_STEPS.indexOf(minutes as 0)}
        onChange={i => onChange(hours * 60 + DURATION_MINUTE_STEPS[i])} disabled={disabled} onMoving={onMoving} />
    </View>
    {!!caption && <Text style={styles.caption} accessibilityLiveRegion="polite">{caption}</Text>}
  </View>;
}
