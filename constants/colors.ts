export const Colors = {
  // Toss TDS 기반 파랑 브랜드 (Primary #3182f6)
  primary: '#3182F6',
  dark: '#2272EB',    // primary-hover / 강조
  deeper: '#1B64DA',  // weak-foreground / 진한 파랑
  light: '#74A8F9',
  pale: '#C9E2FF',
  bg: '#E8F3FF',      // weak-background
  tinted: '#F0F6FF',
  black: '#191F28',   // TDS foreground
  white: '#FFFFFF',

  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',

  overlay: 'rgba(0,0,0,0.4)',

  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',

  // Glassmorphism 토큰 (RN: expo-blur BlurView + 반투명 오버레이로 구현)
  glass: {
    background: 'rgba(255,255,255,0.55)', // frosted 오버레이 채움색
    border: 'rgba(255,255,255,0.65)',     // 밝은 테두리로 유리 가장자리 표현
    shadow: 'rgba(49,130,246,0.18)',      // 브랜드 블루 기반 그림자
    tint: 'rgba(49,130,246,0.10)',        // 매장 컬러 미적용 시 기본 틴트
  },

  // Emotionally Aware 감성 색상 토큰
  sentiment: {
    positive: '#1D9E75',
    positiveBg: '#EDFAF4',
    neutral: '#D97706',
    neutralBg: '#FEF6E7',
    negative: '#EF4444',
    negativeBg: '#FDECEC',
  },
} as const;

export type ColorKey = keyof typeof Colors;

// 매장별 글래스 틴트 (store.id 해시 기반으로 매장마다 다른 은은한 틴트)
const GLASS_TINTS = [
  'rgba(49,130,246,0.10)',  // blue (brand)
  'rgba(27,100,218,0.10)',  // deep blue
  'rgba(245,158,11,0.10)',  // amber
  'rgba(139,92,246,0.10)',  // violet
];

export function glassTintForStore(storeId?: string | null): string {
  if (!storeId) return Colors.glass.tint;
  let hash = 0;
  for (let i = 0; i < storeId.length; i++) {
    hash = (hash * 31 + storeId.charCodeAt(i)) >>> 0;
  }
  return GLASS_TINTS[hash % GLASS_TINTS.length];
}
