import { Text } from 'react-native';
import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { EvidenceStagingPanel } from '../../lib/components/EvidenceStagingPanel';
import { EvidenceSelection } from '../../lib/types/evidence';
let mockId = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `draft-${++mockId}` }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-file-system', () => ({ Paths: { cache: { uri: 'file:///cache' } }, File: jest.fn().mockImplementation(() => ({ delete: jest.fn(), size: 100 })) }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/components/ui/SheetModal', () => ({
  SheetModal: ({ visible, children, onDismiss }: { visible: boolean; children: ReactNode; onDismiss?: () => void }) => {
    const { useEffect: useMockEffect, useRef: useMockRef } = jest.requireActual('react');
    const shown = useMockRef(false);
    useMockEffect(() => { if (visible) shown.current = true; else if (shown.current) { shown.current = false; onDismiss?.(); } }, [visible]);
    return visible ? children : null;
  },
}));
const mockAlbum = jest.fn(), mockCamera = jest.fn(), mockCameraPermission = jest.fn(), mockAlbumPermission = jest.fn();
jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Current: 'current' },
  launchImageLibraryAsync: (...args: unknown[]) => mockAlbum(...args), launchCameraAsync: (...args: unknown[]) => mockCamera(...args),
  requestCameraPermissionsAsync: () => mockCameraPermission(), getMediaLibraryPermissionsAsync: () => mockAlbumPermission(),
}));
const asset = { uri: 'file:///cache/receipt.jpg', fileName: 'receipt.jpg', mimeType: 'image/jpeg', fileSize: 100 };
function Harness({ initial = [] }: { initial?: EvidenceSelection[] }) {
  const [files, setFiles] = useState(initial);
  return <><Text>{`선택 ${files.length}개`}</Text><EvidenceStagingPanel files={files} onChange={setFiles} /></>;
}
beforeEach(() => {
  jest.clearAllMocks(); mockId = 0;
  mockAlbum.mockResolvedValue({ canceled: false, assets: [asset] });
  mockAlbumPermission.mockResolvedValue({ status: 'granted', accessPrivileges: 'all' });
  mockCameraPermission.mockResolvedValue({ granted: true });
});
async function choose(option: '앨범에서 선택' | '카메라 촬영') {
  fireEvent.press(screen.getByLabelText('사진 추가'));
  await act(async () => { fireEvent.press(screen.getByText(option)); });
}

test('증빙 사진 카드는 사진만 받고 상시 안내문·파일 선택이 없다', async () => {
  render(<Harness />);
  expect(screen.getByText('증빙 사진')).toBeTruthy();
  expect(screen.queryByText(/파일 선택|PDF|MiB|기기에만 보관|OCR|인식/)).toBeNull();
  fireEvent.press(screen.getByLabelText('사진 추가'));
  expect(screen.getByText('10장 더 붙일 수 있어요')).toBeTruthy();
  expect(screen.getByText('앨범에서 선택')).toBeTruthy();
  expect(screen.getByText('카메라 촬영')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('앨범에서 선택')); });
  await waitFor(() => expect(screen.getByText('선택 1개')).toBeTruthy());
});

test('붙인 사진은 크게 보고 ✕로 뺄 수 있다', async () => {
  render(<Harness />);
  await choose('앨범에서 선택');
  await waitFor(() => expect(screen.getByLabelText('receipt.jpg 미리보기')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('receipt.jpg 미리보기'));
  fireEvent(screen.getByTestId('evidence-photo'), 'accessibilityEscape');
  expect(screen.queryByTestId('evidence-photo')).toBeNull();
  fireEvent.press(screen.getByLabelText('receipt.jpg 빼기'));
  expect(screen.queryByLabelText('receipt.jpg 미리보기')).toBeNull();
});

test('10장이면 사진 추가 버튼을 끈다', () => {
  const initial = Array.from({ length: 10 }, (_, i) => ({ id: `existing-${i}`, uri: `file:///cache/${i}.jpg`, name: `${i}.jpg`, mimeType: 'image/jpeg', size: 100 }));
  render(<Harness initial={initial} />);
  const button = screen.getByLabelText('10장을 모두 붙였어요');
  expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByText('바꾸려면 사진을 먼저 빼 주세요.')).toBeTruthy();
});

test.each([['image/heic', 12 * 1024 * 1024, true], ['image/jpeg', 25 * 1024 * 1024 + 1, false]])('원본 크기 확인 %s %i', async (mimeType, fileSize, accepted) => {
  mockAlbum.mockResolvedValue({ canceled: false, assets: [{ ...asset, mimeType, fileSize }] });
  render(<Harness />);
  await choose('앨범에서 선택');
  await waitFor(() => expect(screen.getByText(accepted ? '선택 1개' : '선택 0개')).toBeTruthy());
  expect(!!screen.queryByLabelText('receipt.jpg 미리보기')).toBe(accepted);
});

test('앨범은 이름을 모르는 원본 여러 장을 남은 장수만큼 고른다', async () => {
  mockAlbum.mockResolvedValue({ canceled: false, assets: ['a', 'b'].map(name => ({ uri: 'file:///cache/' + name + '.heic', fileName: null, assetId: null, fileSize: 100, mimeType: 'image/heic' })) });
  render(<Harness />);
  await choose('앨범에서 선택');
  await waitFor(() => expect(screen.getByText('선택 2개')).toBeTruthy());
  expect(mockAlbum).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, exif: false, quality: 1 }));
});

test('카메라 권한이 없으면 설정 안내 후, 허용하면 찍은 사진을 붙인다', async () => {
  mockCameraPermission.mockResolvedValueOnce({ granted: false }).mockResolvedValueOnce({ granted: true });
  mockCamera.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/camera.jpg', fileSize: 100, mimeType: 'image/jpeg' }] });
  render(<Harness />);
  await choose('카메라 촬영');
  await waitFor(() => expect(screen.getByText(/설정에서 카메라 접근/)).toBeTruthy());
  expect(mockCamera).not.toHaveBeenCalled();
  await choose('카메라 촬영');
  await waitFor(() => expect(screen.getByText('선택 1개')).toBeTruthy());
  expect(mockCamera).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], exif: false }));
});

test.each(['limited', 'none'])('앨범을 취소했고 접근이 %s이면 설정 안내를 한다', async accessPrivileges => {
  mockAlbum.mockResolvedValue({ canceled: true, assets: null });
  mockAlbumPermission.mockResolvedValue({ accessPrivileges, status: accessPrivileges === 'none' ? 'denied' : 'granted' });
  render(<Harness />);
  await choose('앨범에서 선택');
  await waitFor(() => expect(screen.getByText(/설정에서 Rattle의 사진 접근/)).toBeTruthy());
  expect(screen.getByText('선택 0개')).toBeTruthy();
});
