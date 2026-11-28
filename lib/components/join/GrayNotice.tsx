/* design-system: DESIGN.md — 주의 표시는 노란색 대신 회색 바탕 + 정보 아이콘(막지 않는 안내). */
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../icons/AppIcon';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Type } from '../../../constants/designTokens';

export function GrayNotice({ message }: { message: string }) {
  return <View style={styles.box} accessible accessibilityRole="text" accessibilityLabel={message}>
    <AppIcon name="information-circle-outline" size={18} color={Colors.gray500} />
    <Text style={styles.text}>{message}</Text>
  </View>;
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.contextBg, borderRadius: 12, padding: 12, marginTop: 10 },
  text: { flex: 1, fontFamily: Fonts.wantedRegular, fontSize: Type.sm, lineHeight: 20, color: Colors.gray700 },
});
