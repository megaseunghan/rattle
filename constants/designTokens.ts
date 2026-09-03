import { ViewStyle } from 'react-native';
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
