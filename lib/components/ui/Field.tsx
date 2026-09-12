import { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Radius, Type } from '../../../constants/designTokens';

interface FieldProps extends TextInputProps {
  label: string;
  helpText?: string;
  /** 입력 박스 우측에 아이콘/버튼 등을 배치할 슬롯 (주소 검색 등) */
  rightSlot?: React.ReactNode;
}

export function Field({ label, helpText, rightSlot, style, onFocus, onBlur, ...inputProps }: FieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, isFocused && styles.boxFocused]}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={Colors.gray400}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...inputProps}
        />
        {rightSlot}
      </View>
      {helpText && <Text style={styles.helpText}>{helpText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.gray500,
    marginBottom: 6,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Radius.field,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  boxFocused: {
    borderColor: Colors.primary,
  },
  input: {
    flex: 1,
    fontSize: Type.base,
    fontWeight: '600',
    color: Colors.black,
    padding: 0,
  },
  helpText: {
    fontSize: 11,
    fontWeight: '400',
    color: Colors.gray400,
    marginTop: 6,
  },
});
