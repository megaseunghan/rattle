import { EvidencePhoto } from './EvidencePhoto';
import { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
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
    <Modal visible={open} onRequestClose={() => setOpen(false)}>
      {/* 모달은 별도 창이라 안에서 안전영역을 다시 재야 닫기가 상태 표시줄 아래로 내려온다. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}><SafeAreaView style={styles.viewer} onAccessibilityEscape={() => setOpen(false)}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="증빙 미리보기 닫기" style={styles.close} onPress={() => setOpen(false)}><Text>닫기</Text></TouchableOpacity>
        {open && <EvidencePhoto onClose={() => setOpen(false)} source={{ uri: selection.uri }} style={styles.original} contentFit="contain" cachePolicy="none" />}
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  thumbnail: { width: 112, height: 88, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray50 },
  image: { width: '100%', height: '100%' }, viewer: { flex: 1, backgroundColor: Colors.white },
  original: { flex: 1 }, close: { minHeight: 44, padding: 12 },
});
