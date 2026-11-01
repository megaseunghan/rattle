import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Radius, Type } from '../../../constants/designTokens';

interface ChipOption {
  key: string;
  label: string;
}

interface ChipRowProps {
  options: ChipOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function ChipRow({ options, selectedKey, onSelect }: ChipRowProps) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.key === selectedKey;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(option.key)}
            style={({ pressed }) => [styles.chip, selected ? styles.chipSelected : styles.chipUnselected, pressed && styles.pressed]}
          >
            <Text style={selected ? styles.textSelected : styles.textUnselected}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
  },
  chipSelected: {
    borderColor: Colors.black,
    backgroundColor: Colors.black,
  },
  chipUnselected: {
    borderColor: Colors.gray200,
  },
  pressed: { opacity: 0.7 },
  textSelected: {
    fontSize: Type.sm,
    fontWeight: '600',
    color: Colors.white,
  },
  textUnselected: {
    fontSize: Type.sm,
    fontWeight: '600',
    color: Colors.gray600,
  },
});
