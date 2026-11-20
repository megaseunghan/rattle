import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import type { ImagePickerOptions } from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { EvidenceSelection, MAX_EVIDENCE_FILES } from '../types/evidence';
import { UserFacingError } from '../utils/error';
import { prepareEvidenceSelection } from './evidenceSelection';

/** Only picker cache copies belong to us; never delete a user's original. */
export function disposeEvidenceCache(uri: string): void {
  const cache = Paths?.cache?.uri;
  if (!cache || !uri.startsWith(`${cache.replace(/\/$/, '')}/`)) return;
  try { new File(uri).delete(); } catch { /* The OS may already have evicted this cache copy. */ }
}
export type EvidenceSource = 'library' | 'camera' | 'file';
type Asset = Parameters<typeof prepareEvidenceSelection>[0];

async function pickAssets(source: EvidenceSource, limit: number, multiple: boolean, isCurrent: () => boolean): Promise<Asset[]> {
  if (source === 'file') {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], multiple, copyToCacheDirectory: true });
    return result.assets ?? [];
  }
  // Loading on demand also leaves file attachment available on older installed runtimes.
  let picker: typeof import('expo-image-picker');
  try { picker = require('expo-image-picker'); }
  catch { throw new UserFacingError('앱을 업데이트한 뒤 사진 보관함과 카메라를 사용할 수 있어요. 지금은 파일을 선택해주세요.'); }
  if (!isCurrent()) return [];
  const options: ImagePickerOptions = { mediaTypes: ['images'], exif: false, quality: 1 };
  if (source === 'camera') {
    const permission = await picker.requestCameraPermissionsAsync();
    if (!isCurrent()) return [];
    if (!permission.granted) throw new UserFacingError('설정에서 카메라 접근을 허용하거나 사진 보관함에서 선택해주세요.');
  }
  // The system photo picker grants access to the chosen items, even with limited library access.
  // Do not request permission to read the entire library or rely on assetId or fileName.
  const result = source === 'camera' ? await picker.launchCameraAsync(options) :
    await picker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: multiple, selectionLimit: limit,
      preferredAssetRepresentationMode: picker.UIImagePickerPreferredAssetRepresentationMode.Current });
  if (result.canceled && source === 'library' && Platform.OS === 'ios' && isCurrent()) {
    const permissions = await picker.getMediaLibraryPermissionsAsync();
    if (permissions.accessPrivileges === 'limited' || permissions.status === 'denied') {
      throw new UserFacingError('원하는 사진이 보이지 않으면 설정에서 Rattle의 사진 접근을 확인하고 허용할 사진을 추가해주세요.');
    }
  }
  return (result.assets ?? []).map(asset => ({
    uri: asset.uri, name: asset.fileName || asset.uri.split('/').pop() || '증빙 사진',
    mimeType: asset.mimeType ?? undefined, size: asset.fileSize,
  }));
}

export async function pickEvidenceSelections(count: number, isCurrent: () => boolean, source: EvidenceSource = 'library', single = false): Promise<EvidenceSelection[]> {
  const limit = MAX_EVIDENCE_FILES - count;
  if (limit <= 0) throw new UserFacingError('증빙은 한 건에 최대 10개까지 첨부할 수 있어요.');
  let assets: Asset[];
  try {
    assets = await pickAssets(source, single ? 1 : limit, !single && limit > 1, isCurrent);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (/PERMISSION|DENIED|UNAUTHORIZED/i.test(code)) throw new UserFacingError('설정에서 사진 또는 카메라 접근을 허용해주세요. 일부 사진만 허용한 경우 사용할 사진을 추가할 수 있어요.');
    throw error;
  }
  try {
    if (!isCurrent()) { assets.forEach(file => disposeEvidenceCache(file.uri)); return []; }
    if (assets.length > (single ? 1 : limit)) throw new UserFacingError('증빙은 한 건에 최대 10개까지 첨부할 수 있어요.');
    return assets.map(asset => {
      const prepared = prepareEvidenceSelection({ ...asset, size: asset.size ?? new File(asset.uri).size });
      if (source !== 'file' && prepared.mimeType === 'application/pdf') {
        throw new UserFacingError('사진 형식을 확인할 수 없어요. 다른 사진을 선택해주세요.');
      }
      return { id: randomUUID(), uri: asset.uri, name: asset.name, ...prepared };
    });
  } catch (error) { assets.forEach(file => disposeEvidenceCache(file.uri)); throw error; }
}
