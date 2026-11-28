/** S54 급여대장 쓰기 동작 모음. 저장 뒤 다시 불러오고, 결과를 짧은 알림으로 알린다. 화면은 상태만 넘긴다. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { usePreviewWriteGuard } from '../../hooks/usePreviewWriteGuard';
import { revealAccountNumber } from '../../services/accountNumbers';
import {
  cancelDailyLaborPayment, deleteDailyLaborEntry, recordDailyLaborPayments, saveDailyLaborEntry, saveDailyLaborer, setDailyLaborerActive,
  type DailyLaborEntryInput, type DailyLaborerInput,
} from '../../services/dailyLaborers';
import { getErrorMessage } from '../../utils/error';
import { toPaymentGroups } from './paymentDraft';
import type { PaymentSubmit } from './PaymentSheet';
import type { DailyLaborEntry, DailyLaborer, DailyLaborPayment } from '../../../types';

const TOAST_MS = 1800;

interface LedgerActionOptions {
  storeId: string | undefined;
  reload: () => Promise<void>;
  nameOf: (laborerId: string) => string;
}

export function useLedgerActions({ storeId, reload, nameOf }: LedgerActionOptions) {
  const { assertCanWrite } = usePreviewWriteGuard();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { setRevealed({}); }, [storeId]);

  const notify = useCallback((message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(''), TOAST_MS);
  }, []);

  /** 쓰기 하나를 실행한다. 성공하면 done과 알림, 실패하면 안내창. 어느 쪽이든 끝나면 다시 불러온다(성공했을 때만). */
  const run = useCallback(async (action: (storeId: string) => Promise<unknown>, done: () => void, message: string, failTitle: string) => {
    if (!storeId) return;
    setSaving(true);
    try {
      assertCanWrite();
      await action(storeId);
      done();
      notify(message);
      await reload();
    } catch (e) {
      Alert.alert(failTitle, getErrorMessage(e, '저장하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.'));
    } finally {
      setSaving(false);
    }
  }, [storeId, assertCanWrite, notify, reload]);

  const saveLaborer = useCallback((input: DailyLaborerInput, previous: DailyLaborer | undefined, done: () => void) =>
    run(id => saveDailyLaborer(id, input, previous), () => {
      // 계좌번호를 바꿨을 수 있으니 펼쳐 둔 번호를 접는다(옛 번호를 보고 이체하지 않게).
      if (previous) setRevealed(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== previous.id)));
      done();
    }, previous ? '저장했어요' : '명단에 추가했어요', '저장하지 못했어요'), [run]);

  const toggleActive = useCallback((laborer: DailyLaborer, done: () => void) =>
    run(id => setDailyLaborerActive(id, laborer, !laborer.is_active), done,
      laborer.is_active ? '일 안 하는 사람으로 바꿨어요' : '다시 일하는 사람으로 바꿨어요', '바꾸지 못했어요'), [run]);

  const saveEntry = useCallback((input: DailyLaborEntryInput, previous: DailyLaborEntry | undefined, done: () => void) =>
    run(id => saveDailyLaborEntry(id, input, previous), done, previous ? '저장했어요' : '지급 대기에 넣었어요', '저장하지 못했어요'), [run]);

  const deleteEntry = useCallback((entry: DailyLaborEntry, done: () => void) =>
    run(id => deleteDailyLaborEntry(id, entry), done, '기록을 지웠어요', '지우지 못했어요'), [run]);

  const revertPayment = useCallback((payment: DailyLaborPayment, done: () => void) =>
    run(id => cancelDailyLaborPayment(id, payment.id), done, '지급 대기로 되돌렸어요', '되돌리지 못했어요'), [run]);

  /** 여러 사람을 한 번에 지급 완료로 바꾼다. 일부만 바뀌면 바뀐 사람과 못 바꾼 사람을 함께 알린다. */
  const recordPayments = useCallback(async (submit: PaymentSubmit, done: () => void) => {
    if (!storeId) return;
    setSaving(true);
    try {
      assertCanWrite();
      const result = await recordDailyLaborPayments(storeId, toPaymentGroups(submit.groups), submit.paidOn, submit.method);
      if (result.recorded.length) done();
      if (!result.failed.length) notify('지급 완료로 바꿨어요');
      else {
        const failedNames = result.failed.map(f => `${nameOf(f.laborerId)}: ${f.message}`).join('\n');
        Alert.alert(result.recorded.length ? `${result.recorded.length}명만 지급 완료로 바꿨어요` : '지급 완료로 바꾸지 못했어요', failedNames);
      }
      // 실패해도 다시 불러온다(응답만 끊기고 저장된 경우를 화면에 반영). 모두 실패하면 시트는 그대로 둔다.
      await reload();
    } catch (e) {
      Alert.alert('지급 완료로 바꾸지 못했어요', getErrorMessage(e, '연결 상태를 확인하고 다시 시도해 주세요.'));
    } finally {
      setSaving(false);
    }
  }, [storeId, assertCanWrite, notify, reload, nameOf]);

  const toggleAccount = useCallback(async (laborer: DailyLaborer) => {
    if (revealed[laborer.id]) { setRevealed(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== laborer.id))); return; }
    try {
      const number = await revealAccountNumber('daily_laborer', laborer.id);
      if (number) setRevealed(current => ({ ...current, [laborer.id]: number }));
      else Alert.alert('계좌번호가 없어요', '정보에서 계좌번호를 다시 입력해 주세요.');
    } catch (e) {
      Alert.alert('계좌번호를 보지 못했어요', getErrorMessage(e, '연결 상태를 확인하고 다시 시도해 주세요.'));
    }
  }, [revealed]);

  return { saving, toast, revealed, saveLaborer, toggleActive, saveEntry, deleteEntry, revertPayment, recordPayments, toggleAccount };
}
