let mockMode = 'self';
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ devPreviewMode: mockMode, user: { id: 'owner' } }) }));
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StoreSetupWizard } from '../../lib/components/StoreSetupWizard';
import { createStoreWithSetup, StoreSetupNotCreatedError } from '../../lib/services/stores';
import { createStoreInviteCode } from '../../lib/services/storeMembers';
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'same-request' }));
jest.mock('../../lib/services/stores', () => ({
  createStoreWithSetup: jest.fn(),
  StoreSetupNotCreatedError: class extends jest.requireActual('../../lib/utils/error').UserFacingError { constructor(mockMessage: string) { super(mockMessage); this.name = 'StoreSetupNotCreatedError'; } },
}));
jest.mock('../../lib/services/storeMembers', () => ({ createStoreInviteCode: jest.fn() }));

const NAME = '예: 래틀 연남점';

beforeEach(() => {
  mockMode = 'self';
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  (createStoreInviteCode as jest.Mock).mockResolvedValue('K7Q2M9XA4RTDP8WE');
});

const next = (view: ReturnType<typeof render>, label = '다음') => fireEvent.press(view.getByRole('button', { name: label }));

async function answerAll(view: ReturnType<typeof render>) {
  await waitFor(() => expect(view.getByRole('button', { name: '다음' }).props.accessibilityState.disabled).toBe(true));
  fireEvent.changeText(view.getByPlaceholderText(NAME), '연남점');
  next(view);
  await waitFor(() => expect(view.getByText('매장 주소를 알려주세요')).toBeTruthy());
  next(view, '건너뛰기');
  await waitFor(() => expect(view.getByText('매장은 몇 시에 문을 닫나요?')).toBeTruthy());
  expect(view.getByText('오후 11시에 닫아요.')).toBeTruthy();
  next(view);
  await waitFor(() => expect(view.getByText('손익을 누구와 공유할까요?')).toBeTruthy());
  expect(view.getByRole('button', { name: '다음' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(view.getByRole('radio', { name: /직원에게만 공유/ }));
  next(view);
  await waitFor(() => expect(view.getByText('수습 기간이 있나요?')).toBeTruthy());
}

it('다섯 질문에 답하고 재시도해도 같은 요청 ID로 한 매장만 만든다', async () => {
  const created = jest.fn().mockResolvedValue(undefined);
  const view = render(<StoreSetupWizard userId="owner" onCreated={created} onCancel={jest.fn()} />);
  await answerAll(view);
  expect(view.queryByText('수습 중 급여는 몇 %로 줄까요?')).toBeNull();
  fireEvent.press(view.getByRole('radio', { name: '3개월' }));
  expect(view.getByText('기본값')).toBeTruthy();
  expect(view.getByText(/수습 중 9,288원이에요/)).toBeTruthy();
  fireEvent.changeText(view.getByLabelText('수습 중 급여 비율, 퍼센트'), '95%');
  expect(view.queryByText('기본값')).toBeNull();

  (createStoreWithSetup as jest.Mock).mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce({ id: 'new-store', name: '연남점', pos_setup_choice: 'later' });
  next(view, '매장 시작하기');
  await waitFor(() => expect(view.getByText('매장을 만들지 못했어요. 다시 시도해 주세요.')).toBeTruthy());
  // 입력은 그대로 남고, 같은 내용으로만 다시 시도한다.
  expect(view.getByLabelText('수습 중 급여 비율, 퍼센트').props.value).toBe('95');
  next(view, '매장 시작하기');
  await waitFor(() => expect(view.getByText('K7Q2-M9XA-4RTD-P8WE')).toBeTruthy());
  const expected = {
    name: '연남점', shareScope: 'regular_only', requestId: 'same-request', address: null, closingTime: '23:00',
    isOpen24h: false, probationMonths: 3, probationRate: 0.95,
  };
  expect((createStoreWithSetup as jest.Mock).mock.calls.map(call => call[0])).toEqual([expected, expected]);
  expect(createStoreInviteCode).toHaveBeenCalledWith('new-store');
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('store-setup:v1:owner');
  expect(created).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: '홈으로 가기' }));
  await waitFor(() => expect(created).toHaveBeenCalledWith('new-store', 'later'));
});

it('24시간 영업이면 오전 6시 기준으로 저장한다', async () => {
  (createStoreWithSetup as jest.Mock).mockResolvedValue({ id: 's', name: '연남점', pos_setup_choice: 'later' });
  const view = render(<StoreSetupWizard userId="owner" onCreated={jest.fn()} onCancel={jest.fn()} />);
  await waitFor(() => expect(view.getByPlaceholderText(NAME)).toBeTruthy());
  fireEvent.changeText(view.getByPlaceholderText(NAME), '연남점');
  next(view);
  await waitFor(() => expect(view.getByText('매장 주소를 알려주세요')).toBeTruthy());
  fireEvent.changeText(view.getByPlaceholderText('예: 서울 마포구 동교로 123'), '서울 마포구');
  next(view);
  await waitFor(() => expect(view.getByRole('radio', { name: '24시간 영업해요' })).toBeTruthy());
  fireEvent.press(view.getByRole('radio', { name: '24시간 영업해요' }));
  expect(view.getByText('오전 6시를 기준으로 하루 매출을 나눠요.')).toBeTruthy();
  next(view);
  await waitFor(() => expect(view.getByText('24시간 영업 · 오전 6시 기준')).toBeTruthy());
  fireEvent.press(view.getByRole('radio', { name: /공유하지 않기/ }));
  next(view);
  await waitFor(() => expect(view.getByText('수습 기간이 있나요?')).toBeTruthy());
  next(view, '매장 시작하기');
  await waitFor(() => expect(createStoreWithSetup).toHaveBeenCalledWith(expect.objectContaining({
    address: '서울 마포구', closingTime: '06:00', isOpen24h: true, probationMonths: 0, probationRate: 0.9, shareScope: 'none',
  })));
});

it('답한 질문을 눌러 고치고, 뒤로 가면 고치기 전 값으로 돌아간다', async () => {
  const view = render(<StoreSetupWizard userId="owner" onCreated={jest.fn()} onCancel={jest.fn()} />);
  await answerAll(view);
  fireEvent.press(view.getByRole('button', { name: '매장 이름을 알려주세요, 연남점' }));
  fireEvent.changeText(view.getByPlaceholderText(NAME), '');
  expect(view.getByRole('button', { name: '다음' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(view.getByRole('button', { name: '고치기 닫기' }));
  expect(view.getByRole('button', { name: '매장 이름을 알려주세요, 연남점' })).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: '매장 이름을 알려주세요, 연남점' }));
  fireEvent.changeText(view.getByPlaceholderText(NAME), '합정점');
  next(view);
  await waitFor(() => expect(view.getByRole('button', { name: '매장 이름을 알려주세요, 합정점' })).toBeTruthy());
  expect(view.getByRole('button', { name: '매장 시작하기' })).toBeTruthy();
});

it('뒤로가도 답을 보존하고, 첫 질문에서 뒤로 가면 닫는다', async () => {
  const cancel = jest.fn();
  const view = render(<StoreSetupWizard userId="owner" onCreated={jest.fn()} onCancel={cancel} />);
  await answerAll(view);
  fireEvent.press(view.getByRole('button', { name: '이전 질문으로' }));
  expect(view.queryByText('수습 기간이 있나요?')).toBeNull();
  expect(view.getByRole('radio', { name: /직원에게만 공유/ }).props.accessibilityState.checked).toBe(true);
  next(view);
  await waitFor(() => expect(view.getByText('수습 기간이 있나요?')).toBeTruthy());
  for (let i = 0; i < 4; i += 1) fireEvent.press(view.getByRole('button', { name: '이전 질문으로' }));
  expect(view.getByPlaceholderText(NAME).props.value).toBe('연남점');
  fireEvent.press(view.getByRole('button', { name: '매장 만들기 닫기' }));
  expect(cancel).toHaveBeenCalled();
  const saved = JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls.at(-1)[1]);
  expect(saved).toMatchObject({ name: '연남점', scope: 'regular_only', requestId: 'same-request' });
});

it('다음 연타는 저장 중에 질문을 건너뛰지 않는다', async () => {
  let release!: () => void;
  (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const view = render(<StoreSetupWizard userId="owner" onCreated={jest.fn()} onCancel={jest.fn()} />);
  await waitFor(() => expect(view.getByPlaceholderText(NAME)).toBeTruthy());
  fireEvent.changeText(view.getByPlaceholderText(NAME), '내 매장');
  await waitFor(() => expect(view.getByRole('button', { name: '다음' }).props.accessibilityState.disabled).toBe(false));
  next(view); next(view);
  await act(async () => { release(); });
  await waitFor(() => expect(view.getByText('매장 주소를 알려주세요')).toBeTruthy());
  expect(view.queryByText('매장은 몇 시에 문을 닫나요?')).toBeNull();
});

it('제출한 초안을 다시 열면 같은 내용·같은 요청 ID로만 다시 시도한다', async () => {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({
    name: '저장 매장', address: '', isOpen24h: false, meridiem: '오전', hour12: 1, scope: 'none',
    probationMonths: 1, rateText: '90', requestId: 'original', step: 4, submitted: true,
  }));
  (createStoreWithSetup as jest.Mock).mockResolvedValue({ id: 'created', name: '저장 매장', pos_setup_choice: 'later' });
  const view = render(<StoreSetupWizard userId="owner" onCreated={jest.fn()} onCancel={jest.fn()} />);
  await waitFor(() => expect(view.getByRole('button', { name: '매장 시작하기' })).toBeTruthy());
  expect(view.getByRole('button', { name: '매장은 몇 시에 문을 닫나요?, 다음 날 오전 1시' }).props.accessibilityState.disabled).toBe(true);
  next(view, '매장 시작하기');
  await waitFor(() => expect(createStoreWithSetup).toHaveBeenCalledWith(expect.objectContaining({
    name: '저장 매장', requestId: 'original', closingTime: '01:00', probationMonths: 1, probationRate: 0.9,
  })));
});

it('이미 만든 매장의 초안은 새 매장 만들기에 다시 쓰지 않는다', async () => {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ name: '기존 생성 매장', pos: 'later', scope: 'none', requestId: 'completed-request', submitted: true }));
  const view = render(<StoreSetupWizard knownRequestIds={['completed-request']} userId="owner" onCreated={jest.fn()} onCancel={jest.fn()} />);
  await waitFor(() => expect(AsyncStorage.removeItem).toHaveBeenCalled());
  expect(view.getByText('매장 이름을 알려주세요')).toBeTruthy();
  expect(view.getByPlaceholderText(NAME).props.value).toBe('');
});

it('참여코드를 못 받아도 매장 생성 실패로 보이지 않고 코드 자리만 다시 불러온다', async () => {
  (createStoreWithSetup as jest.Mock).mockResolvedValue({ id: 'new-store', name: '연남점', pos_setup_choice: 'later' });
  (createStoreInviteCode as jest.Mock).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce('ABCD1234EFGH5678');
  const view = render(<StoreSetupWizard userId="owner" onCreated={jest.fn()} onCancel={jest.fn()} />);
  await answerAll(view);
  next(view, '매장 시작하기');
  await waitFor(() => expect(view.getByText('참여코드를 불러오지 못했어요.')).toBeTruthy());
  expect(view.getByText(/매장을 만들었어요/)).toBeTruthy();
  expect(view.getByRole('button', { name: '참여코드 복사하기' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(view.getByRole('button', { name: '참여코드 다시 불러오기' }));
  await waitFor(() => expect(view.getByText('ABCD-1234-EFGH-5678')).toBeTruthy());
});

it.each(['regular', 'part_time'])('%s 미리보기에서 보존된 매장 생성 초안을 제출해도 만들지 않는다', async mode => {
  mockMode = mode;
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ name: '가상 매장', scope: 'none', requestId: 'qa-preview', step: 4, submitted: true }));
  const view = render(<StoreSetupWizard userId="owner" onCreated={jest.fn()} onCancel={jest.fn()} />);
  await waitFor(() => expect(view.getByRole('button', { name: '매장 시작하기' })).toBeTruthy());
  next(view, '매장 시작하기');
  await act(async () => {});
  expect(createStoreWithSetup).not.toHaveBeenCalled();
});

it('서버가 입력을 거절하면(매장 안 만들어짐) 잠금을 풀고 초안을 다시 고칠 수 있게 저장한다', async () => {
  const view = render(<StoreSetupWizard userId="owner" onCreated={jest.fn()} onCancel={jest.fn()} />);
  await answerAll(view);
  (createStoreWithSetup as jest.Mock).mockRejectedValueOnce(new StoreSetupNotCreatedError('입력한 내용을 다시 확인해 주세요.'));
  next(view, '매장 시작하기');
  await waitFor(() => expect(view.getByText('입력한 내용을 다시 확인해 주세요.')).toBeTruthy());
  const saved = (AsyncStorage.setItem as jest.Mock).mock.calls.map(call => JSON.parse(call[1]));
  expect(saved.some(value => value.submitted === true)).toBe(true);
  expect(saved[saved.length - 1].submitted).toBe(false);
});
