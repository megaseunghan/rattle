/* design-system: DESIGN.md — 고른 항목은 연파랑 배경, 라디오 원은 쓰지 않는다. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Radius, Type } from '../../../constants/designTokens';

export interface ChoiceOption<T extends string> {
  value: T;
  title: string;
  caption?: string;
  /** 제목 옆 작은 글자(예: '3.3%') */
  badge?: string;
}

export function ChoiceList<T extends string>({ label, options, selected, onSelect, disabled }: {
  label: string; options: readonly ChoiceOption<T>[]; selected: T | null; onSelect: (value: T) => void; disabled?: boolean;
}) {
  return <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel={label}>
    {options.map(option => {
      const active = option.value === selected;
      return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.title}
        accessibilityHint={option.caption} accessibilityState={{ checked: active, disabled }} disabled={disabled}
        onPress={() => onSelect(option.value)} style={({ pressed }) => [styles.choice, active && styles.active, pressed && styles.pressed]}>
        <Text style={[styles.title, active && styles.activeTitle]}>
          {option.title}{option.badge ? <Text style={styles.badge}>  {option.badge}</Text> : null}
        </Text>
        {!!option.caption && <Text style={styles.caption}>{option.caption}</Text>}
      </Pressable>;
    })}
  </View>;
}

/** 근무 형태·계약·주휴수당 보기(확정 시안 문구). */
export const EMPLOYMENT_CHOICES: readonly ChoiceOption<'regular' | 'part_time'>[] = [
  { value: 'regular', title: '직원', caption: '월급을 기준으로 급여를 받아요.' },
  { value: 'part_time', title: '파트타이머', caption: '시급과 실근무시간으로 급여를 받아요.' },
];
export const INCOME_CHOICES: readonly ChoiceOption<'employee' | 'freelancer' | 'unknown'>[] = [
  { value: 'employee', title: '근로자', caption: '근로계약을 맺고 일해요. 대부분 여기에 해당해요.' },
  { value: 'freelancer', title: '프리랜서', badge: '3.3%', caption: '사업소득으로 받고 3.3%를 떼요.' },
  { value: 'unknown', title: '잘 모르겠어요', caption: '관리자가 확인하고 정해요.' },
];
export const WEEKLY_REST_CHOICES: readonly ChoiceOption<'separate' | 'included' | 'unknown'>[] = [
  { value: 'separate', title: '따로 받아요', caption: '주휴수당을 시급과 별도로 계산해요.' },
  { value: 'included', title: '시급에 들어 있어요', caption: '약속한 시급에 주휴수당이 포함돼 있어요.' },
  { value: 'unknown', title: '잘 모르겠어요', caption: '관리자가 확인하고 정해요.' },
];

export function choiceTitle<T extends string>(options: readonly ChoiceOption<T>[], value: T | null | undefined): string {
  const option = options.find(item => item.value === value);
  return option ? `${option.title}${option.badge ? ` ${option.badge}` : ''}` : '';
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  choice: { minHeight: 64, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: Colors.chipBg },
  active: { backgroundColor: Colors.bg },
  pressed: { opacity: 0.7 },
  title: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.md, color: Colors.black },
  activeTitle: { color: Colors.action },
  badge: { fontFamily: Fonts.geistMedium, fontSize: Type.sm, color: Colors.gray500 },
  caption: { marginTop: 4, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, lineHeight: 19, color: Colors.gray600 },
});
