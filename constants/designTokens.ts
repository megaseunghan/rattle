import { TextStyle, ViewStyle } from 'react-native';
import { Colors } from './colors';

/**
 * 텍스트/카드 디자인 토큰. fontSize·borderRadius가 화면마다 제각각 흩어지는 걸 막기 위한
 * 최소 스케일 — 새 스타일을 추가할 때 여기 값을 우선 재사용한다.
 */
export const Type = {
  xs: 11,
  sm: 13,
  base: 14,
  md: 15,
  lg: 17,
  xl: 20,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  pill: 20,
  field: 12,
} as const;

/** design_handoff_rattle_ui/design-tokens.md 기준 여백 스케일 */
export const Spacing = {
  screenX: 22,
  sectionTop: 20,
  sectionHeaderGap: 6,
  cardPadding: 14,
  listGap: 8,
  fieldGap: 14,
  ctaPadding: 22,
} as const;

/** 앱 전반에서 가장 널리 쓰이는 '흰 카드' 패턴 (list/summary/employee/empty 카드 등의 기준값) */
export const CardStyle: ViewStyle = {
  backgroundColor: Colors.white,
  borderRadius: Radius.xl,
  borderWidth: 0.5,
  borderColor: Colors.gray100,
};

/** 하단 탭 화면 헤더의 타이틀 텍스트 기준값 (fontSize 17 / fontWeight 600) */
export const ScreenTitle = {
  fontSize: Type.lg,
  fontWeight: '600' as const,
  color: Colors.black,
};

/** patterns.md 4번 — 요약 카드 (tinted 배경) */
export const SummaryCardStyle: ViewStyle = {
  backgroundColor: Colors.tinted,
  borderRadius: Radius.xl,
  padding: Spacing.cardPadding,
};

/** patterns.md 5번 — 리스트 카드 (gray100 테두리) */
export const ListCardStyle: ViewStyle = {
  backgroundColor: Colors.white,
  borderWidth: 1,
  borderColor: Colors.gray100,
  borderRadius: Radius.lg,
  padding: Spacing.cardPadding,
};

/** patterns.md 5번 — 리스트 카드 선택 상태 */
export const ListCardSelectedStyle: ViewStyle = {
  ...ListCardStyle,
  borderWidth: 1.5,
  borderColor: Colors.primary,
  backgroundColor: Colors.tinted,
};

export type BadgeVariant = 'positive' | 'negative' | 'neutral' | 'employment' | 'auto';

/** patterns.md 15번 — 뱃지 (variant별 배경/텍스트 색) */
export const BadgeColors: Record<BadgeVariant, { bg: string; text: string }> = {
  positive: { bg: Colors.positiveBg, text: Colors.positive },
  negative: { bg: Colors.negativeBg, text: Colors.negative },
  neutral: { bg: Colors.gray100, text: Colors.gray500 },
  employment: { bg: Colors.tinted, text: Colors.primary },
  auto: { bg: Colors.positiveBg, text: Colors.positive },
};

export const BadgeStyle: ViewStyle = {
  borderRadius: Radius.pill,
  paddingVertical: 4,
  paddingHorizontal: 9,
  alignSelf: 'flex-start',
};

export const BadgeTextStyle: TextStyle = {
  fontSize: Type.xs,
  fontWeight: '600',
};
