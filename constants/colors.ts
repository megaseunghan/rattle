export const Colors = {
  primary: '#1D9E75',
  dark: '#0F6E56',
  deeper: '#085041',
  light: '#5DCAA5',
  pale: '#9FE1CB',
  bg: '#E1F5EE',
  tinted: '#EDFAF4',
  black: '#111111',
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
    shadow: 'rgba(15,110,86,0.18)',       // 브랜드 그린 기반 그림자
    tint: 'rgba(29,158,117,0.10)',        // 매장 컬러 미적용 시 기본 틴트
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
  'rgba(29,158,117,0.10)', // green (brand)
  'rgba(59,130,246,0.10)', // blue
  'rgba(245,158,11,0.10)', // amber
  'rgba(139,92,246,0.10)', // violet
];

export function glassTintForStore(storeId?: string | null): string {
  if (!storeId) return Colors.glass.tint;
  let hash = 0;
  for (let i = 0; i < storeId.length; i++) {
    hash = (hash * 31 + storeId.charCodeAt(i)) >>> 0;
  }
  return GLASS_TINTS[hash % GLASS_TINTS.length];
}
