/* design-system: DESIGN.md — S54 지급 완료 내역. 금액은 고칠 수 없고 '지급 대기로 되돌리기'로만 다시 고친다. */
import { Alert } from 'react-native';
import { Button } from '../ui/Button';
import { DeductionBlock } from './DeductionBlock';
import { LaborSheet } from './LaborSheet';
import { dayLabel, won } from './format';
import { GrayNote } from './parts';
import type { DailyLaborPayment } from '../../../types';

export const METHOD_LABEL: Record<DailyLaborPayment['payment_method'], string> = { transfer: '계좌이체', cash: '현금' };

interface PaymentDetailSheetProps {
  payment: DailyLaborPayment | null;
  name: string;
  days: number;
  saving: boolean;
  onClose: () => void;
  onRevert: (payment: DailyLaborPayment) => void;
}

export function PaymentDetailSheet({ payment, name, days, saving, onClose, onRevert }: PaymentDetailSheetProps) {
  const actual = payment
    ? { income_tax: payment.income_tax, local_income_tax: payment.local_income_tax, employment_insurance: payment.employment_insurance }
    : { income_tax: 0, local_income_tax: 0, employment_insurance: 0 };
  const estimate = payment
    ? { income_tax: payment.estimated_income_tax ?? actual.income_tax, local_income_tax: payment.estimated_local_income_tax ?? actual.local_income_tax,
      employment_insurance: payment.estimated_employment_insurance ?? actual.employment_insurance }
    : actual;

  function confirmRevert() {
    if (!payment) return;
    Alert.alert('지급 대기로 되돌릴까요?', `${name}님 ${dayLabel(payment.paid_on)} 지급 완료(실수령 ${won(payment.net_pay)})를 지급 대기로 되돌려요. 되돌리면 금액을 다시 고칠 수 있어요.`, [
      { text: '그대로 두기', style: 'cancel' },
      { text: '되돌리기', style: 'destructive', onPress: () => onRevert(payment) },
    ]);
  }

  return (
    <LaborSheet visible={!!payment} onClose={onClose} title={payment ? `${dayLabel(payment.paid_on)} 지급` : ''}
      subtitle={payment ? METHOD_LABEL[payment.payment_method] : undefined}
      footer={<>
        <Button label="닫기" onPress={onClose} />
        <Button label="지급 대기로 되돌리기" variant="text" onPress={confirmRevert} disabled={saving} />
      </>}>
      {payment && <DeductionBlock name={name} days={days} gross={payment.gross} estimate={estimate} actual={actual} />}
      <GrayNote text="지급 완료한 기록은 금액을 고치거나 지울 수 없어요. 고치려면 지급 대기로 되돌려 주세요." />
    </LaborSheet>
  );
}
