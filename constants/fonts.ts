/** design_handoff_rattle_ui/design-tokens.md — 본문 Pretendard, 숫자 강조 Space Grotesk */
export const Fonts = {
  pretendardRegular: 'Pretendard-Regular',
  pretendardMedium: 'Pretendard-Medium',
  pretendardSemiBold: 'Pretendard-SemiBold',
  pretendardBold: 'Pretendard-Bold',
  spaceGroteskRegular: 'SpaceGrotesk-Regular',
  spaceGroteskMedium: 'SpaceGrotesk-Medium',
  spaceGroteskBold: 'SpaceGrotesk-Bold',
} as const;

export const FONT_ASSETS = {
  [Fonts.pretendardRegular]: require('../assets/fonts/Pretendard-Regular.otf'),
  [Fonts.pretendardMedium]: require('../assets/fonts/Pretendard-Medium.otf'),
  [Fonts.pretendardSemiBold]: require('../assets/fonts/Pretendard-SemiBold.otf'),
  [Fonts.pretendardBold]: require('../assets/fonts/Pretendard-Bold.otf'),
  [Fonts.spaceGroteskRegular]: require('../assets/fonts/SpaceGrotesk-Regular.ttf'),
  [Fonts.spaceGroteskMedium]: require('../assets/fonts/SpaceGrotesk-Medium.ttf'),
  [Fonts.spaceGroteskBold]: require('../assets/fonts/SpaceGrotesk-Bold.ttf'),
};

/** fontWeight 값을 로드된 Pretendard 정적 굵기 중 가장 가까운 것으로 매핑 (커스텀 폰트는 fontWeight만으로 굵기가 안 바뀌므로) */
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
  if (w >= 500) return Fonts.spaceGroteskMedium;
  return Fonts.spaceGroteskRegular;
}
