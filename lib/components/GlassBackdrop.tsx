/* design-system: DESIGN.md 「S04 매장 홈 시안 확정」 — 화면 바탕. 2026-11-28부터 파란 조명 대신 회색(homeCanvas) 한 색이다.
 * 이름은 기존 화면(탭 셸·업무 화면 17곳) 호환을 위해 그대로 둔다. */
import { StyleSheet, View } from 'react-native';
import { Colors } from '../../constants/colors';

export function GlassBackdrop() {
  return <View style={[StyleSheet.absoluteFill, styles.fill]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

const styles = StyleSheet.create({ fill: { backgroundColor: Colors.homeCanvas } });
