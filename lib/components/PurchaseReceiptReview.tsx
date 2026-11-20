import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import type { ParsedReceipt, ReceiptGuidanceCode, ReceiptItem } from '../ocr/receiptParser';
import type { usePurchaseReceipt } from '../hooks/usePurchaseReceipt';

type Props = {
  draft: ReturnType<typeof usePurchaseReceipt>;
  disabled: boolean;
  editing?: boolean;
  application: (item: ReceiptItem) => { label: string; apply: () => void } | undefined;
};
const extras = { shipping: '배송비', discount: '할인', vat: '부가세', deposit: '보증금', returns: '회수액' } as const;

const guidance: Record<ReceiptGuidanceCode, string> = {
  PAYMENT_SCREEN_REQUIRED: '결제 화면을 함께 올려주세요.',
  WHOLE_ORDER_TOTAL: '주문 전체 결제금액이에요. 이번 배송분에 해당하는 금액인지 확인해주세요.',
  INVALID_THOUSANDS_GROUPING: '금액의 천 단위 구분이 불분명해요. 원문을 확인해주세요.',
};

function receiptWarnings(receipt: ParsedReceipt) {
  const candidate = receipt.selectedTotal ?? receipt.suggestedTotal;
  const messages = new Set(receipt.guidanceCodes.map(code => guidance[code]));
  for (const warning of candidate?.warnings ?? []) {
    if (warning === '주문 전체 결제금액이에요' && receipt.guidanceCodes.includes('WHOLE_ORDER_TOTAL')) continue;
    if (warning === '금액의 천단위 구분이 이상해요. 원문을 확인해 주세요' && receipt.guidanceCodes.includes('INVALID_THOUSANDS_GROUPING')) continue;
    messages.add(warning);
  }
  return [...messages];
}

export function PurchaseReceiptReview({ draft, disabled, editing, application }: Props) {
  const [confirmingFile, setConfirmingFile] = useState<string | null>(null);
  if (!draft.readings.length) return null;
  function action(label: string, press: () => void) {
    return <TouchableOpacity accessibilityRole="button" disabled={disabled} style={styles.button} onPress={press}><Text style={styles.link}>{label}</Text></TouchableOpacity>;
  }
  return <View style={styles.review}>
    {draft.readings.map(({ file, result }) => {
      const receipt = result && 'receipt' in result ? result.receipt : null;
      const candidate = receipt?.selectedTotal ?? receipt?.suggestedTotal;
      const wholeOrder = receipt?.guidanceCodes.includes('WHOLE_ORDER_TOTAL');
      const offerTotal = !editing && candidate && (wholeOrder || receipt?.suggestedTotal || draft.readings.length > 1);
      function applyTotal() {
        if (candidate) draft.changeTotal(String(candidate.value), file.id);
        setConfirmingFile(null);
      }
      return <View key={file.id} style={styles.group}>
      <Text style={styles.title}>{file.name}</Text>
      {!result ? <Text accessibilityLiveRegion="polite">휴대폰에서 읽고 있어요…</Text> : 'error' in result ? <>
        <Text accessibilityRole="alert">{result.error}</Text>
        {action('다시 읽기', () => draft.retry(file.id))}
      </> : <>
        {receiptWarnings(result.receipt).map(message => <Text key={message} accessibilityRole="alert">{message}</Text>)}
        {result.receipt.selectedTotal && <Text>영수증 합계 {result.receipt.selectedTotal.value.toLocaleString()}원</Text>}
        {result.receipt.suggestedTotal && <Text>확인이 필요해요 · 합계 후보 {result.receipt.suggestedTotal.value.toLocaleString()}원</Text>}
        {offerTotal && (wholeOrder && confirmingFile === file.id ? <>
          <Text>전체 주문 금액과 이번 배송분의 금액이 같나요?</Text>
          {action('같아요 · 합계 적용', applyTotal)}
          {action('적용 취소', () => setConfirmingFile(null))}
        </> : wholeOrder ? action('배송분 금액 확인', () => setConfirmingFile(file.id)) : action('이 합계 적용', applyTotal))}
        {!result.receipt.selectedTotal && !result.receipt.suggestedTotal && <Text>영수증에서 합계를 확인해 직접 입력해주세요.</Text>}
        {result.receipt.items.map((item, index) => {
          const match = application(item);
          return <View key={index}><Text style={styles.title}>{item.name.value}</Text>
            <Text>수량 {item.quantity?.value ?? '미확인'} · 단가 {item.unitPrice ? item.unitPrice.value.toLocaleString() + '원' : '미확인'}</Text>
            {item.amount && <Text>인쇄 금액 {item.amount.value.toLocaleString()}원</Text>}
            {item.arithmeticMatches === false && <Text>수량과 단가가 인쇄 금액과 달라요.</Text>}
            {match && action(match.label, match.apply)}
          </View>;
        })}
        {!result.receipt.items.length && <Text>품목과 수량·단가는 직접 입력해주세요.</Text>}
        {Object.entries(extras).map(([key, label]) => {
          const amount = result.receipt.amounts[key as keyof typeof extras];
          if (!amount) return null;
          const guidance = editing ? '품목 금액에 포함됐는지 확인해주세요.' :
            key === 'discount' || key === 'returns' ? '차감 후 품목 금액을 확인해주세요.' : '별도 청구된 금액은 품목으로 추가해주세요.';
          return <Text key={key}>{label} {amount.value.toLocaleString()}원 · {guidance}</Text>;
        })}
      </>}
    </View>;
    })}
    {!editing && <><Text style={styles.title}>대조할 영수증 합계 (원)</Text>
      <TextInput style={styles.input} accessibilityLabel="대조할 영수증 합계" editable={!disabled} value={draft.total} onChangeText={value => draft.changeTotal(value)} keyboardType="number-pad" placeholder="영수증 합계 입력" />
    </>}
  </View>;
}
const styles = StyleSheet.create({
  review: { gap: 8, marginVertical: 12 }, group: { gap: 6, borderTopColor: Colors.gray200, borderTopWidth: 1, paddingVertical: 8 },
  title: { color: Colors.black, fontFamily: Fonts.wantedSemiBold, fontSize: 15 }, button: { minHeight: 44, justifyContent: 'center' },
  link: { color: Colors.action }, input: { borderColor: Colors.gray300, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, minHeight: 44 },
});
