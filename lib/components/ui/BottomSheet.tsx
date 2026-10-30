import { SheetModal } from './SheetModal';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Spacing, Type } from '../../../constants/designTokens';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  return (
    <SheetModal visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          {title && <Text style={styles.title}>{title}</Text>}
          {children}
        </Pressable>
      </Pressable>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlaySheet,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.homeCanvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: Spacing.screenX,
    paddingBottom: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray200,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: Type.lg,
    fontWeight: '700',
    color: Colors.black,
    marginBottom: 16,
  },
});
