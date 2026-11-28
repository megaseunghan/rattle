import { fireEvent, render, screen } from '@testing-library/react-native';
import { PaymentSheet } from '../../lib/components/daily-labor/PaymentSheet';
import { createPaymentDraft } from '../../lib/components/daily-labor/paymentDraft';
import type { DailyLaborEntry } from '../../types';

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) };
});
jest.mock('../../lib/components/ui/SheetModal', () => ({ SheetModal: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null) }));

const worked = (id: string, workDate: string) => ({
  id, laborer_id: 'l', payment_id: null, work_date: workDate, gross: 100_000, day_income_tax: 0, employment_insurance: 900, calculation_version: '2026-v2',
}) as DailyLaborEntry;

function renderSheet(workDates: string[], onSubmit = jest.fn()) {
  const entries = workDates.map((d, i) => worked(`e${i}`, d));
  render(<PaymentSheet visible initialGroups={createPaymentDraft(entries, new Set(entries.map(e => e.id)))} nameOf={() => '박서준'}
    today="2026-11-28" saving={false} onClose={jest.fn()} onSubmit={onSubmit} />);
  return onSubmit;
}

it('오늘 근무한 기록이 있으면 어제는 고를 수 없다', () => {
  renderSheet(['2026-11-26', '2026-11-28']);
  expect(screen.getByRole('radio', { name: '어제' }).props.accessibilityState.disabled).toBe(true);
});

it('어제까지 근무한 기록이면 어제를 지급일로 고를 수 있다', () => {
  const onSubmit = renderSheet(['2026-11-26', '2026-11-27']);
  fireEvent.press(screen.getByRole('radio', { name: '어제' }));
  fireEvent.press(screen.getByText('현금'));
  fireEvent.press(screen.getByText('지급 완료로 바꾸기'));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ paidOn: '2026-11-27', method: 'cash' }));
});

it('달력에서 마지막 근무일 전 날짜는 고를 수 없다', () => {
  renderSheet(['2026-11-20']);
  fireEvent.press(screen.getByRole('radio', { name: '다른 날' }));
  expect(screen.getByLabelText('11월 19일, 근무일 전이라 고를 수 없어요').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByLabelText('11월 20일').props.accessibilityState.disabled).toBe(false);
});
