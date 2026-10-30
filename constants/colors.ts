export const Colors = {
  // Toss TDS 기반 파랑 브랜드 (Primary #3182f6)
  primary: '#3182F6',
  splashLight: '#B6D4FF',
  action: '#1B64DA',   // 작은 액션 글자와 흰 글자 버튼용 대비 확보; 로고 primary는 유지
  dark: '#2272EB',    // primary-hover / 강조
  deeper: '#1B64DA',  // weak-foreground / 진한 파랑
  light: '#74A8F9',
  pale: '#C9E2FF',
  bg: '#E8F3FF',      // weak-background
  tinted: '#F0F6FF',
  black: '#191F28',   // TDS foreground
  white: '#FFFFFF',

  // 로고 블루를 따른 차가운 바탕. 입력·읽기 전용·확인 필요 상태를 구분한다.
  homeCanvas: '#F3F8FF',
  homeBorder: '#DDE8F5',
  taskBg: '#EAF2FF',
  taskBorder: '#BDD3F2',
  contextBg: '#F1F5FA',
  focusBg: '#F4F8FF',
  fieldErrorBg: '#FFF1F2',
  totalBg: '#173B70',

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
  overlaySheet: 'rgba(17,24,39,.45)',
  overlayDetail: 'rgba(17,24,39,.28)',
  overlayCoach: 'rgba(17,24,39,.6)',

  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',

  // 디자인 핸드오프(design_handoff_rattle_ui) 뱃지·증감률 토큰
  positive: '#1D9E75',
  positiveBg: 'rgba(29,158,117,.1)',
  negative: '#EF4444',
  negativeBg: '#FEE2E2',
  warningBg: '#FEF3C7',
  warningStroke: '#D97706',

  kakao: {
    bg: '#FEE500',
    text: '#191919',
  },

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
