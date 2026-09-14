import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../../constants/colors';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
}

/** 매출 대비 매입/인건비/비용/순이익 구성비를 보여주는 도넛 차트 (react-native-svg 기반) */
export function DonutChart({ segments, size = 140, strokeWidth = 18, centerLabel, centerValue }: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0);

  let offsetAccum = 0;
  const arcs = total > 0
    ? segments.map(seg => {
        const value = Math.max(0, seg.value);
        const fraction = value / total;
        const dash = fraction * circumference;
        const arc = { ...seg, dash, offset: -offsetAccum };
        offsetAccum += dash;
        return arc;
      })
    : [];

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={Colors.gray100}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {arcs.map((arc, i) => (
          <Circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
            strokeDashoffset={arc.offset}
            strokeLinecap="butt"
            fill="none"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        ))}
      </Svg>
      <View style={[styles.center, { width: size, height: size }]} pointerEvents="none">
        {centerValue && <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit>{centerValue}</Text>}
        {centerLabel && <Text style={styles.centerLabel}>{centerLabel}</Text>}
      </View>
    </View>
  );
}

export function DonutLegend({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0);
  return (
    <View style={styles.legend}>
      {segments.map(seg => (
        <View key={seg.label} style={styles.legendRow}>
          <View style={styles.legendLabelGroup}>
            <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>{seg.label}</Text>
          </View>
          <Text style={styles.legendPct}>
            {total > 0 ? `${((Math.max(0, seg.value) / total) * 100).toFixed(0)}%` : '0%'}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 12 },
  centerValue: { fontSize: 15, fontWeight: '700', color: Colors.black },
  centerLabel: { fontSize: 10, fontWeight: '500', color: Colors.gray400 },

  legend: { gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  legendLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  legendLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray600 },
  legendPct: { fontSize: 12, fontWeight: '700', color: Colors.black, flexShrink: 0 },
});
