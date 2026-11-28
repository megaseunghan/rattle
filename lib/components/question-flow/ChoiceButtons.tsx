/* design-system: DESIGN.md — 짧은 선택 버튼 묶음(가로 n칸, 넘치면 다음 줄). 고른 칸은 연파랑 바탕 + Colors.action 글자. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';

export interface ChoiceButtonOption<T extends string> {
  value: T;
  label: string;
  /** 버튼 글자가 짧을 때 화면 읽기용 정식 이름. */
  accessibilityLabel?: string;
}

export interface ChoiceButtonsProps<T extends string> {
  label: string;
  options: readonly ChoiceButtonOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** 한 줄에 놓을 칸 수. 기본은 보기 수. */
  columns?: number;
  disabled?: boolean;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

export function ChoiceButtons<T extends string>({ label, options, value, onChange, columns, disabled }: ChoiceButtonsProps<T>) {
  const size = Math.max(1, columns ?? options.length);
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
    {chunk(options, size).map((row, r) => <View key={r} style={styles.row}>
      {row.map(option => {
        const checked = option.value === value;
        return <Pressable key={option.value} disabled={disabled} onPress={() => onChange(option.value)}
          accessibilityRole="radio" accessibilityLabel={option.accessibilityLabel ?? option.label}
          accessibilityState={{ checked, disabled: !!disabled }}
          style={({ pressed }) => [styles.button, pressed && !checked && styles.pressed, checked && styles.checked]}>
          <Text style={[styles.text, checked && styles.textChecked]} numberOfLines={2}>{option.label}</Text>
        </Pressable>;
      })}
      {Array.from({ length: size - row.length }, (_, i) => <View key={`gap-${i}`} style={styles.spacer} />)}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  group: { marginTop: 20, gap: 6 },
  row: { flexDirection: 'row', gap: 6 },
  button: { flex: 1, minWidth: 0, minHeight: 48, borderRadius: 12, backgroundColor: Colors.gray50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  spacer: { flex: 1 },
  pressed: { backgroundColor: Colors.gray100 },
  checked: { backgroundColor: Colors.bg },
  text: { fontSize: 15, fontWeight: '600', color: Colors.gray600, textAlign: 'center' },
  textChecked: { color: Colors.action },
});
