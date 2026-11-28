/* design-system: DESIGN.md — 설명이 붙은 세로 선택지. 고른 줄은 연파랑 바탕 + Colors.action 제목, 라디오 원 없음. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';

export interface ChoiceOption<T extends string> {
  value: T;
  title: string;
  description?: string;
}

export interface ChoiceListProps<T extends string> {
  /** 묶음의 화면 읽기 이름. */
  label: string;
  options: readonly ChoiceOption<T>[];
  /** null이면 아무것도 고르지 않은 상태. */
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function ChoiceList<T extends string>({ label, options, value, onChange, disabled }: ChoiceListProps<T>) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.list}>
    {options.map(option => {
      const checked = option.value === value;
      return <Pressable key={option.value} disabled={disabled} onPress={() => onChange(option.value)}
        accessibilityRole="radio" accessibilityLabel={option.description ? `${option.title}, ${option.description}` : option.title}
        accessibilityState={{ checked, disabled: !!disabled }}
        style={({ pressed }) => [styles.choice, pressed && styles.pressed, checked && styles.checked]}>
        <Text style={[styles.title, checked && styles.titleChecked]}>{option.title}</Text>
        {option.description ? <Text style={styles.description}>{option.description}</Text> : null}
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  list: { marginTop: 12, gap: 4 },
  choice: { minHeight: 72, justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 14, marginHorizontal: -14, borderRadius: 14 },
  pressed: { backgroundColor: Colors.gray50 },
  checked: { backgroundColor: Colors.bg },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: Colors.black },
  titleChecked: { color: Colors.action },
  description: { fontSize: 13, lineHeight: 20, color: Colors.gray500, marginTop: 4 },
});
