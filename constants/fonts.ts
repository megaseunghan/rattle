/** 승인된 서체: 한글·본문 Wanted Sans, 금액·숫자 Geist. iOS용 정적 굵기별 파일. */
// 폰트와 함께 배포하는 라이선스 원문을 실제 JS 번들에도 포함한다.
export const FONT_LICENSES: Record<string, string> = require('../assets/fonts/licenses.json');

export const Fonts = {
  wantedRegular: 'WantedSans-Regular',
  wantedMedium: 'WantedSans-Medium',
  wantedSemiBold: 'WantedSans-SemiBold',
  wantedBold: 'WantedSans-Bold',
  geistRegular: 'Geist-Regular',
  geistMedium: 'Geist-Medium',
  geistSemiBold: 'Geist-SemiBold',
  geistBold: 'Geist-Bold',
  // 기존 화면의 토큰 이름은 호환 별칭으로 보존한다.
  pretendardRegular: 'WantedSans-Regular',
  pretendardMedium: 'WantedSans-Medium',
  pretendardSemiBold: 'WantedSans-SemiBold',
  pretendardBold: 'WantedSans-Bold',
  spaceGroteskRegular: 'Geist-Regular',
  spaceGroteskMedium: 'Geist-Medium',
  spaceGroteskBold: 'Geist-Bold',
} as const;

export const FONT_ASSETS = {
  [Fonts.wantedRegular]: require('../assets/fonts/WantedSans-Regular.ttf'),
  [Fonts.wantedMedium]: require('../assets/fonts/WantedSans-Medium.ttf'),
  [Fonts.wantedSemiBold]: require('../assets/fonts/WantedSans-SemiBold.ttf'),
  [Fonts.wantedBold]: require('../assets/fonts/WantedSans-Bold.ttf'),
  [Fonts.geistRegular]: require('../assets/fonts/Geist-Regular.ttf'),
  [Fonts.geistMedium]: require('../assets/fonts/Geist-Medium.ttf'),
  [Fonts.geistSemiBold]: require('../assets/fonts/Geist-SemiBold.ttf'),
  [Fonts.geistBold]: require('../assets/fonts/Geist-Bold.ttf'),
};

/** 기존 함수 호출도 Wanted Sans의 정확한 정적 굵기로 매핑한다. */
export function pretendard(weight?: string | number): string {
  const w = weight ? Number(weight) : 400;
  if (w >= 700) return Fonts.pretendardBold;
  if (w >= 600) return Fonts.pretendardSemiBold;
  if (w >= 500) return Fonts.pretendardMedium;
  return Fonts.pretendardRegular;
}

export function spaceGrotesk(weight?: string | number): string {
  const w = weight ? Number(weight) : 400;
  if (w >= 700) return Fonts.spaceGroteskBold;
  if (w >= 600) return Fonts.geistSemiBold;
  if (w >= 500) return Fonts.spaceGroteskMedium;
  return Fonts.spaceGroteskRegular;
}
