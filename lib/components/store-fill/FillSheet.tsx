import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetModal } from '../ui/SheetModal';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import { Spacing } from '../../../constants/designTokens';

export interface FillSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  accessibilityLabel?: string;
  children: ReactNode;
}

/** 마저 채우기·홈 유도 공용 아래 시트. 흰 바탕, 손잡이, 바깥을 누르면 닫힘. */
export function FillSheet({ visible, onClose, title, description, accessibilityLabel, children }: FillSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <SheetModal visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]} accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel ?? title}>
          <View style={styles.grab} />
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlaySheet },
  sheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: Spacing.screenX, maxHeight: '90%',
  },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.gray200, alignSelf: 'center', marginBottom: 16 },
  title: { fontFamily: Fonts.wantedBold, fontSize: 19, lineHeight: 27, color: Colors.black },
  description: { fontFamily: Fonts.wantedRegular, fontSize: 13, lineHeight: 20, color: Colors.gray500, marginTop: 4 },
});
