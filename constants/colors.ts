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
} as const;

export type ColorKey = keyof typeof Colors;
