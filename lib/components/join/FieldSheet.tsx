/* design-system: DESIGN.md — 줄을 누르면 올라오는 아래 시트. 바깥을 누르거나 뒤로가기로 닫고, 확인 버튼으로 정한다. */
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetModal } from '../ui/SheetModal';
import { Button } from '../ui';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Spacing, Type } from '../../../constants/designTokens';

export interface FieldSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** 없으면 확인 버튼을 두지 않는다(보기를 누르면 바로 정해지는 시트). */
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  /** 화면 높이까지 쓰는 시트(계좌·수습) */
  tall?: boolean;
  /** 휠을 돌리는 중에는 시트 스크롤을 멈춘다. */
  scrollEnabled?: boolean;
  children: ReactNode;
}

export function FieldSheet({ visible, title, subtitle, onClose, onConfirm, confirmLabel = '확인', confirmDisabled, busy, tall, scrollEnabled = true, children }: FieldSheetProps) {
  const insets = useSafeAreaInsets();
  return <SheetModal visible={visible} onRequestClose={() => { if (!busy) onClose(); }}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="시트 닫기" onPress={() => { if (!busy) onClose(); }} />
      <View style={[styles.sheet, tall ? styles.tall : styles.short, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} accessibilityViewIsModal>
        <View style={styles.grab} />
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled} showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets>
          {children}
        </ScrollView>
        {onConfirm && <View style={styles.footer}>
          <Button label={confirmLabel} onPress={onConfirm} disabled={confirmDisabled} loading={busy} />
        </View>}
      </View>
    </KeyboardAvoidingView>
  </SheetModal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlaySheet },
  sheet: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.screenX, paddingTop: 10 },
  short: { maxHeight: '88%' },
  tall: { height: '92%' },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200, marginBottom: 18 },
  title: { fontFamily: Fonts.wantedBold, fontSize: Type.xl, lineHeight: 28, color: Colors.black },
  subtitle: { marginTop: 6, fontFamily: Fonts.wantedRegular, fontSize: Type.base, lineHeight: 21, color: Colors.gray600 },
  body: { flexGrow: 0, flexShrink: 1, marginTop: 18 },
  bodyContent: { paddingBottom: 8 },
  footer: { paddingTop: 12 },
});
