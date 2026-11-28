/* design-system: DESIGN.md — S54 일용근로자 급여대장 시트 틀(키보드 회피 + 내용 스크롤 + 하단 고정 버튼) */
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';
import { Spacing, Type } from '../../../constants/designTokens';
import { SheetModal } from '../ui/SheetModal';

/** 시트가 화면을 다 덮지 않게 남기는 위쪽 높이 비율 */
const MAX_SHEET_RATIO = 0.9;

interface LaborSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function LaborSheet({ visible, onClose, title, subtitle, footer, children }: LaborSheetProps) {
  const { height } = useWindowDimensions();
  return (
    <SheetModal visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { maxHeight: height * MAX_SHEET_RATIO }]}>
          <View style={styles.handle} />
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer && <View style={styles.footer}>{footer}</View>}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlaySheet, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: Type.lg + 1, fontWeight: '700', color: Colors.black, paddingHorizontal: Spacing.screenX },
  subtitle: { fontSize: Type.sm, color: Colors.gray500, paddingHorizontal: Spacing.screenX, marginTop: 4, lineHeight: 19 },
  scroll: { flexGrow: 0 },
  body: { paddingHorizontal: Spacing.screenX, paddingTop: 16, paddingBottom: 8, gap: 10 },
  footer: { paddingHorizontal: Spacing.screenX, paddingTop: 8, paddingBottom: 12, gap: 4 },
});
