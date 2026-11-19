import { Platform, Share } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { PickedImage, TextRecognitionNativeModule } from '../../modules/rattle-text-recognition';

export async function pickLabImages(native: TextRecognitionNativeModule): Promise<PickedImage[]> {
  if (Platform.OS === 'ios' && native.pickImages) return native.pickImages();
  if (Platform.OS !== 'android') throw new Error('Photo selection is unavailable');
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return [];
  const images = result.assets.map(asset => ({ uri: asset.uri, fileName: asset.name }));
  if (images.some(image => !image.uri.startsWith('file://'))) {
    await releaseLabImages(native, images.map(i => i.uri));
    throw new Error('A cached local image is required');
  }
  return images;
}
export async function releaseLabImages(native: TextRecognitionNativeModule, uris: string[]): Promise<void> {
  if (Platform.OS === 'ios') { await native.releaseImages?.(uris); return; }
  // Delete only copies inside the system picker's app-cache folder, never source/provider files.
  const root = FileSystem.cacheDirectory && `${FileSystem.cacheDirectory}DocumentPicker/`;
  if (root) await Promise.all(uris.filter(uri => uri.startsWith(root) && !uri.includes('/../')).map(uri => FileSystem.deleteAsync(uri, { idempotent: true })));
}
export async function shareLabJson(native: TextRecognitionNativeModule, json: string): Promise<void> {
  if (Platform.OS === 'ios' && native.shareJson) { await native.shareJson(json); return; }
  if (Platform.OS !== 'android') throw new Error('Sharing is unavailable');
  await Share.share({ title: 'Rattle OCR 측정', message: json });
}
