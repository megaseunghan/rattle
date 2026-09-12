import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors } from '../../../constants/colors';
import { ListCardSelectedStyle, ListCardStyle } from '../../../constants/designTokens';

interface ListCardProps {
  children: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
  /** 우측에 표시할 아이콘. 'chevron'은 이동, 'pencil'은 수정 */
  trailingIcon?: 'chevron' | 'pencil' | 'none';
  style?: ViewStyle;
}

export function ListCard({ children, selected = false, onPress, trailingIcon = 'none', style }: ListCardProps) {
  const content = (
    <View style={[selected ? ListCardSelectedStyle : ListCardStyle, styles.row, style]}>
      <View style={styles.content}>{children}</View>
      {trailingIcon !== 'none' && (
        <Ionicons
          name={trailingIcon === 'chevron' ? 'chevron-forward' : 'pencil'}
          size={16}
          color={Colors.gray400}
        />
      )}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  content: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
