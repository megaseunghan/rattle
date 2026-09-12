import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Type } from '../../../constants/designTokens';

interface GaugeBarProps {
  /** 0~1 사이 진행률 */
  progress: number;
  /** true면 부족/미달 상태로 negative 색상 사용 */
  isUnderTarget?: boolean;
  size?: 'list' | 'summary';
  valueLabel?: string;
}

export function GaugeBar({ progress, isUnderTarget = false, size = 'list', valueLabel }: GaugeBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const height = size === 'summary' ? 6 : 4;
  const fillColor = isUnderTarget ? Colors.negative : Colors.primary;

  return (
    <View style={styles.row}>
      <View style={[styles.track, { height, borderRadius: height / 2 }]}>
        <View
          style={[
            styles.fill,
            { width: `${clamped * 100}%`, backgroundColor: fillColor, borderRadius: height / 2 },
          ]}
        />
      </View>
      {valueLabel && <Text style={styles.value}>{valueLabel}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    flex: 1,
    backgroundColor: Colors.gray100,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
  value: {
    fontSize: Type.sm,
    fontWeight: '600',
    color: Colors.black,
  },
});
