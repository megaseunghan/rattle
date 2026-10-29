jest.mock('../../lib/components/DailyWorkPanel', () => ({ DailyWorkPanel: () => null }));
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { LegacyWorkMinutesForm as WorkMinutesForm } from '../../lib/components/WorkMinutesForm';
import { getPayrollWorkHistory } from '../../lib/services/payroll';
import { Employee } from '../../types';

jest.mock('../../lib/services/payroll', () => ({ getPayrollWorkHistory: jest.fn(), probationFactor: () => 1 }));
const employee = { id: 'emp', store_id: 'store', name: '테스트 직원', employment_type: 'part_time', hourly_wage: 12000 } as Employee;

beforeEach(() => {
  jest.clearAllMocks();
  (getPayrollWorkHistory as jest.Mock).mockResolvedValue([]);
});

it('실제 0분을 저장하고 성공 응답 뒤에만 폼을 닫는다', async () => {
  const save = jest.fn().mockResolvedValue({});
  const close = jest.fn();
  render(<WorkMinutesForm storeId="store" employee={employee} yearMonth="2026-10" onSave={save} onClose={close} />);
  await screen.findByText('아직 작성 이력이 없어요.');
  fireEvent.changeText(screen.getByLabelText('총 근무시간 (분)'), '0');
  fireEvent.changeText(screen.getByLabelText('입력 근거 또는 수정 사유'), '해당 월 미근무');
  fireEvent.press(screen.getByText('근무시간 저장'));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ minutes: '0', hourlyWage: 12000, note: '해당 월 미근무' }, undefined));
  expect(close).toHaveBeenCalledTimes(1);
});

it('미입력·소수 분을 0분으로 바꾸지 않고 오류를 표시한다', async () => {
  const save = jest.fn();
  render(<WorkMinutesForm storeId="store" employee={employee} yearMonth="2026-10" onSave={save} onClose={jest.fn()} />);
  await screen.findByText('아직 작성 이력이 없어요.');
  fireEvent.changeText(screen.getByLabelText('총 근무시간 (분)'), '1.5');
  fireEvent.press(screen.getByText('근무시간 저장'));
  expect(await screen.findByText('총 근무시간을 0 이상의 정수 분으로 입력해주세요.')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});

it('저장에 실패하면 입력값과 폼을 유지한다', async () => {
  const close = jest.fn();
  const save = jest.fn().mockRejectedValue(new Error('연결 실패'));
  render(<WorkMinutesForm storeId="store" employee={employee} yearMonth="2026-10" onSave={save} onClose={close} />);
  await screen.findByText('아직 작성 이력이 없어요.');
  fireEvent.changeText(screen.getByLabelText('총 근무시간 (분)'), '600');
  fireEvent.changeText(screen.getByLabelText('입력 근거 또는 수정 사유'), '월 집계');
  fireEvent.press(screen.getByText('근무시간 저장'));
  expect(await screen.findByText('처리하지 못했어요. 다시 시도해주세요.')).toBeTruthy();
  expect(screen.getByDisplayValue('600')).toBeTruthy();
  expect(close).not.toHaveBeenCalled();
});

it('이력 조회 실패를 빈 이력으로 숨기지 않고 재시도한다', async () => {
  (getPayrollWorkHistory as jest.Mock).mockRejectedValueOnce(new Error('이력 조회 실패')).mockResolvedValueOnce([]);
  render(<WorkMinutesForm storeId="store" employee={employee} yearMonth="2026-10" onSave={jest.fn()} onClose={jest.fn()} />);
  expect(await screen.findByText('처리하지 못했어요. 다시 시도해주세요.')).toBeTruthy();
  expect(screen.queryByText('아직 작성 이력이 없어요.')).toBeNull();
  fireEvent.press(screen.getByText('다시 시도'));
  expect(await screen.findByText('아직 작성 이력이 없어요.')).toBeTruthy();
});
