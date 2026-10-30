/* design-system: DESIGN.md — static light behind frosted surfaces */
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Colors } from '../../constants/colors';
export function GlassBackdrop() {
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <RadialGradient id="topLight" cx="0.95" cy="0.1" rx="0.9" ry="0.6"><Stop offset="0" stopColor={Colors.pale} /><Stop offset="1" stopColor={Colors.homeCanvas} /></RadialGradient>
        <RadialGradient id="bottomLight" cx="0" cy="1" rx="0.9" ry="0.65"><Stop offset="0" stopColor={Colors.light} stopOpacity={0.26} /><Stop offset="1" stopColor={Colors.white} stopOpacity={0} /></RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#topLight)" /><Rect width="100%" height="100%" fill="url(#bottomLight)" />
    </Svg>
  </View>;
}
