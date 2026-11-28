import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { BusinessEntityType, StoreFillPatch, VatType } from '../../../types';
import { Colors } from '../../../constants/colors';
import { Fonts } from '../../../constants/fonts';
import type { StoreFillValues } from '../../utils/storeFill';
import { FillSheet } from './FillSheet';
import { PrimaryButton, Segment, SheetLabel, SheetNote } from './FillParts';
import { ENTITY_OPTIONS, VAT_OPTIONS, formatBusinessNumber, isBusinessNumberInputValid } from './storeFillCopy';

export interface BusinessSheetProps {
  visible: boolean;
  values: StoreFillValues;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (patch: StoreFillPatch) => void;
}

/** 사업자 유형: 개인/법인 + 일반/간이과세를 함께 고르고 확인. */
export function BusinessTypeSheet({ visible, values, saving, error, onClose, onSave }: BusinessSheetProps) {
  const [entity, setEntity] = useState<BusinessEntityType | null>(values.business_entity_type);
  const [vat, setVat] = useState<VatType | null>(values.vat_type);
  useEffect(() => {
    if (!visible) return;
    setEntity(values.business_entity_type);
    setVat(values.vat_type);
  }, [visible, values.business_entity_type, values.vat_type]);
  const ready = !!entity && !!vat && !saving;
  return (
    <FillSheet visible={visible} onClose={onClose} title="사업자 유형을 알려주세요">
      <SheetLabel>사업자</SheetLabel>
      <Segment options={ENTITY_OPTIONS} selected={entity} onSelect={setEntity} />
      <SheetLabel>과세 유형</SheetLabel>
      <Segment options={VAT_OPTIONS} selected={vat} onSelect={setVat} />
      <SheetNote>사업자등록증에 적힌 대로 골라 주세요.</SheetNote>
      {error ? <SheetNote>{error}</SheetNote> : null}
      <PrimaryButton label="확인" disabled={!ready} onPress={() => { if (entity && vat) onSave({ business_entity_type: entity, vat_type: vat }); }} />
    </FillSheet>
  );
}

/** 사업자번호(선택). 비우고 확인하면 지운다. */
export function BusinessNumberSheet({ visible, values, saving, error, onClose, onSave }: BusinessSheetProps) {
  const [text, setText] = useState(formatBusinessNumber(values.business_number ?? ''));
  useEffect(() => { if (visible) setText(formatBusinessNumber(values.business_number ?? '')); }, [visible, values.business_number]);
  const valid = isBusinessNumberInputValid(text);
  const submit = () => {
    if (!valid || saving) return;
    onSave({ business_number: text.replace(/\D/g, '').length ? text : null });
  };
  return (
    <FillSheet visible={visible} onClose={onClose} title="사업자번호를 알려주세요" description="세무사에게 보낼 자료에 같이 적어요.">
      <View style={styles.input}>
        <TextInput value={text} onChangeText={value => setText(formatBusinessNumber(value))} placeholder="000-00-00000"
          placeholderTextColor={Colors.gray400} keyboardType="number-pad" inputMode="numeric" maxLength={12}
          accessibilityLabel="사업자번호" style={styles.inputText} returnKeyType="done" onSubmitEditing={submit} autoFocus />
      </View>
      {!valid ? <SheetNote>숫자 10자리를 모두 넣어 주세요.</SheetNote> : null}
      {error ? <SheetNote>{error}</SheetNote> : null}
      <PrimaryButton label="확인" disabled={!valid || saving} onPress={submit} />
    </FillSheet>
  );
}

const styles = StyleSheet.create({
  input: { marginTop: 20, height: 52, borderBottomWidth: 2, borderBottomColor: Colors.action, justifyContent: 'center', paddingHorizontal: 2 },
  inputText: { fontFamily: Fonts.geistSemiBold, fontSize: 20, color: Colors.black, height: '100%' },
});
