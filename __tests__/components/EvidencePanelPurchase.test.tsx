import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { EvidencePanel } from '../../lib/components/EvidencePanel';
const mockList = jest.fn(), mockReserve = jest.fn(), mockUpload = jest.fn(), mockAlbum = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user' }, store: { id: 'store' }, permissionsReady: true, storeRole: 'owner', canManageStore: true, canReadFinancials: true, devPreviewMode: 'self' }) }));
jest.mock('../../lib/services/evidence', () => ({ listEvidence: (...a: unknown[]) => mockList(...a), reserveEvidence: (...a: unknown[]) => mockReserve(...a), signEvidence: jest.fn().mockResolvedValue('https://example.test/signed'), discardEvidence: jest.fn(), discardPendingEvidence: jest.fn() }));
jest.mock('../../lib/media/evidenceUpload', () => ({ uploadEvidence: (...a: unknown[]) => mockUpload(...a) }));
jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Current: 'current' },
  launchImageLibraryAsync: (...a: unknown[]) => mockAlbum(...a),
  getMediaLibraryPermissionsAsync: async () => ({ status: 'granted', accessPrivileges: 'all' }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'selection-id' }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ Paths: { cache: { uri: 'file:///cache' } }, File: jest.fn().mockImplementation(() => ({ delete: jest.fn(), size: 100 })) }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
// 네이티브처럼 시트가 완전히 닫힌 뒤 onDismiss를 부른다.
jest.mock('../../lib/components/ui/SheetModal', () => ({
  SheetModal: ({ visible, children, onDismiss }: { visible: boolean; children: ReactNode; onDismiss?: () => void }) => {
    const { useEffect: useMockEffect, useRef: useMockRef } = jest.requireActual('react');
    const shown = useMockRef(false);
    useMockEffect(() => { if (visible) shown.current = true; else if (shown.current) { shown.current = false; onDismiss?.(); } }, [visible]);
    return visible ? children : null;
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockReserve.mockResolvedValue({ id: 'selection-id', status: 'pending' });
  mockUpload.mockResolvedValue(undefined);
  mockAlbum.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 100 }] });
});

test('상세에서 사진 추가 → 앨범에서 선택은 시트가 닫힌 뒤 앨범을 열고 바로 올린다', async () => {
  render(<EvidencePanel variant="purchase" target={{ kind: 'purchase', storeId: 'store', id: 'purchase' }} />);
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByLabelText('사진 추가').props.accessibilityState).toMatchObject({ disabled: false }));
  fireEvent.press(screen.getByLabelText('사진 추가'));
  await act(async () => { fireEvent.press(screen.getByText('앨범에서 선택')); });
  await waitFor(() => expect(mockAlbum).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
});

test('사진 ✕는 누르는 영역이 44pt다', async () => {
  mockList.mockResolvedValue([{ id: 'file', store_id: 'store', name: 'receipt.jpg', mime_type: 'image/jpeg', status: 'ready', created_by: 'user' }]);
  render(<EvidencePanel variant="purchase" target={{ kind: 'purchase', storeId: 'store', id: 'purchase' }} />);
  const remove = await screen.findByLabelText('receipt.jpg 빼기');
  expect(StyleSheet.flatten(remove.props.style)).toMatchObject({ width: 44, height: 44 });
});
