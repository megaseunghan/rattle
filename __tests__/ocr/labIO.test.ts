import { Platform, Share } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { pickLabImages, releaseLabImages, shareLabJson } from '../../lib/ocr/labIO';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', deleteAsync: jest.fn() }));
const native = { recognize: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks(); Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
});
it('Android는 여러 이미지 파일을 앱 캐시로 복사해 인식기에 넘긴다', async () => {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/DocumentPicker/synthetic.jpg', name: 'synthetic.jpg' }] });
  expect(await pickLabImages(native)).toEqual([{ uri: 'file:///cache/DocumentPicker/synthetic.jpg', fileName: 'synthetic.jpg' }]);
  expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({ type: 'image/*', multiple: true, copyToCacheDirectory: true });
});
it('Android에서 file URI 변환 실패를 무시하지 않는다', async () => {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'content://synthetic', name: 'synthetic.jpg' }] });
  await expect(pickLabImages(native)).rejects.toThrow('cached local image');
});
it('캐시 사본만 삭제하고 원본 파일은 유지한다', async () => {
  await releaseLabImages(native, ['file:///cache/DocumentPicker/synthetic.jpg', 'file:///photos/original.jpg']);
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/DocumentPicker/synthetic.jpg', { idempotent: true });
});
it('Android는 시스템 Share로 JSON을 공유한다', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  await shareLabJson(native, '{"synthetic":true}');
  expect(share).toHaveBeenCalledWith({ title: 'Rattle OCR 측정', message: '{"synthetic":true}' });
  share.mockRestore();
});
