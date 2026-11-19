import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import OcrLabScreen from '../../app/dev/ocr-lab';
import { useAuth } from '../../lib/contexts/AuthContext';
import { getTextRecognitionModule, recognizeText } from '../../modules/rattle-text-recognition';

jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', deleteAsync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../../modules/rattle-text-recognition', () => ({ getTextRecognitionModule: jest.fn(), recognizeText: jest.fn() }));
const mockPick = jest.fn(), mockRelease = jest.fn(), mockShare = jest.fn();
const access = { user: { id: 'synthetic-user' }, store: { id: 'synthetic-store' }, canManageStore: true, permissionsReady: true, devPreviewMode: 'self', permissionRevision: 1 };
const recognition = { engine: 'apple-vision', elapsedMs: 12, lines: [{ text: '금일합계 8,000', confidence: .9, box: { x: .1, y: .1, w: .4, h: .05 } }] };
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  (useAuth as jest.Mock).mockReturnValue(access);
  (getTextRecognitionModule as jest.Mock).mockReturnValue({ pickImages: mockPick, releaseImages: mockRelease, shareJson: mockShare });
  mockPick.mockResolvedValue([{ uri: 'file:///synthetic.jpg', fileName: 'synthetic.jpg' }]);
  mockRelease.mockResolvedValue(undefined); mockShare.mockResolvedValue(undefined);
  (recognizeText as jest.Mock).mockResolvedValue(recognition);
});
it('실제 관리 권한 없는 계정과 역할 미리보기는 사진을 읽지 못한다', () => {
  (useAuth as jest.Mock).mockReturnValue({ ...access, canManageStore: false });
  const screen = render(<OcrLabScreen />);
  expect(screen.getByText('매장 관리자만 사용할 수 있어요')).toBeTruthy();
  expect(screen.queryByText('사진 선택')).toBeNull();
  (useAuth as jest.Mock).mockReturnValue({ ...access, devPreviewMode: 'employee' });
  screen.rerender(<OcrLabScreen />);
  expect(screen.queryByText('사진 선택')).toBeNull();
  expect(mockPick).not.toHaveBeenCalled();
});
it('사진을 인식하고 원문·합계·시간을 표시한 뒤 임시 사본을 해제한다', async () => {
  const screen = render(<OcrLabScreen />);
  fireEvent.press(screen.getByText('사진 선택'));
  await waitFor(() => expect(screen.getByText('선택 합계 8,000원')).toBeTruthy());
  expect(screen.getByText('apple-vision · 12 ms · 1줄')).toBeTruthy();
  expect(recognizeText).toHaveBeenCalledWith('file:///synthetic.jpg');
  await waitFor(() => expect(mockRelease).toHaveBeenCalledWith(['file:///synthetic.jpg']));
});
it('계정 범위가 바뀌면 이전 OCR 응답을 노출하지 않는다', async () => {
  let resolve!: (value: unknown) => void;
  (recognizeText as jest.Mock).mockReturnValue(new Promise(r => { resolve = r; }));
  const screen = render(<OcrLabScreen />);
  fireEvent.press(screen.getByText('사진 선택'));
  await waitFor(() => expect(recognizeText).toHaveBeenCalled());
  (useAuth as jest.Mock).mockReturnValue({ ...access, user: { id: 'other-synthetic-user' } });
  screen.rerender(<OcrLabScreen />);
  await act(async () => { resolve(recognition); });
  await waitFor(() => expect(mockRelease).toHaveBeenCalled());
  expect(screen.queryByText('선택 합계 8,000원')).toBeNull();
});
it('공유를 명시적으로 확인하면 로컬 URI 없이 JSON을 전달한다', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = render(<OcrLabScreen />);
  fireEvent.press(screen.getByText('사진 선택'));
  await waitFor(() => expect(screen.getByText('선택 합계 8,000원')).toBeTruthy());
  await waitFor(() => expect(mockRelease).toHaveBeenCalled());
  fireEvent.press(screen.getByText('JSON 공유'));
  const buttons = alert.mock.calls[0][2];
  await act(async () => { buttons?.find(b => b.text === '공유')?.onPress?.(); });
  await waitFor(() => expect(mockShare).toHaveBeenCalled());
  const json = mockShare.mock.calls[0][0];
  expect(json).not.toContain('file:///');
  expect(JSON.parse(json).results[0].ocr.lines[0].text).toBe('금일합계 8,000');
  alert.mockRestore();
});
it('Android에서도 기존 파일 선택기로 인식할 수 있다', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const picker = require('expo-document-picker');
  picker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/DocumentPicker/synthetic.jpg', name: 'synthetic.jpg' }] });
  const screen = render(<OcrLabScreen />);
  fireEvent.press(screen.getByText('사진 선택'));
  await waitFor(() => expect(screen.getByText('선택 합계 8,000원')).toBeTruthy());
  expect(recognizeText).toHaveBeenCalledWith('file:///cache/DocumentPicker/synthetic.jpg');
});
