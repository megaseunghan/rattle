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
            onPress={() => onSelect(option.key)}
            style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
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
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
  },
  chipSelected: {
    backgroundColor: Colors.black,
  },
  chipUnselected: {
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  textSelected: {
    fontSize: Type.sm,
    fontWeight: '600',
    color: Colors.white,
  },
  textUnselected: {
    fontSize: Type.sm,
    fontWeight: '500',
    color: Colors.gray600,
  },
});
