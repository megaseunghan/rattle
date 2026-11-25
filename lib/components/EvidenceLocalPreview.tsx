import { EvidenceViewerPhoto } from './EvidencePhoto';
import { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Colors } from '../../constants/colors';
import { EvidenceSelection } from '../types/evidence';

export function EvidenceLocalPreview({ selection, style, fit = 'contain' }: { selection: EvidenceSelection; style?: StyleProp<ViewStyle>; fit?: 'contain' | 'cover' }) {
  const [open, setOpen] = useState(false);
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${selection.name} 미리보기`} style={[styles.thumbnail, style]} onPress={() => {
      if (selection.mimeType === 'application/pdf') Alert.alert('PDF 미리보기', 'PDF는 업로드가 끝난 뒤 첨부 목록에서 열 수 있어요.');
      else setOpen(true);
    }}>
      {selection.mimeType === 'application/pdf' ? <Text>PDF</Text> : <Image source={{ uri: selection.uri }} style={styles.image} contentFit={fit} cachePolicy="none" recyclingKey={selection.id} />}
    </TouchableOpacity>
    {/* 크게 보기는 닫기 버튼 없이 밀기·바깥 누르기·뒤로가기·VoiceOver 문지르기로 닫는다(EvidencePanel과 같음). */}
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        {open && <EvidenceViewerPhoto onClose={() => setOpen(false)} source={{ uri: selection.uri }} style={styles.original} contentFit="contain" cachePolicy="none" />}
      </SafeAreaProvider>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  thumbnail: { width: 112, height: 88, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50 },
  image: { width: '100%', height: '100%' },
  original: { flex: 1 },
});
