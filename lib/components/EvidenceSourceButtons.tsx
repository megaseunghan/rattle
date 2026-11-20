import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import type { EvidenceSource } from '../media/evidencePicker';

const sources = [
  ['library', '사진 보관함'], ['camera', '카메라로 찍기'], ['file', '파일 선택'],
] as const;

export function EvidenceSourceButtons({ disabled, onPick, pdfOnly = false, replacing = false }: {
  disabled: boolean; onPick: (source: EvidenceSource) => void; pdfOnly?: boolean; replacing?: boolean;
}) {
  return <View style={styles.row}>
    {sources.filter(([source]) => !pdfOnly || source === 'file').map(([source, label]) =>
      <TouchableOpacity key={source} accessibilityLabel={replacing ? '기존 첨부 ' + label : label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
        style={[styles.button, source === 'library' && styles.primary]} onPress={() => onPick(source)}>
        <Text style={source === 'library' ? styles.primaryText : styles.text}>{label}</Text>
      </TouchableOpacity>)}
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  button: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  primary: { backgroundColor: Colors.action, borderRadius: 8 },
  text: { fontFamily: Fonts.wantedSemiBold, color: Colors.action },
  primaryText: { fontFamily: Fonts.wantedSemiBold, color: Colors.white },
});
