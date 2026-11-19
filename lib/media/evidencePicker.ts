import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { EvidenceSelection, MAX_EVIDENCE_FILES } from '../types/evidence';
import { UserFacingError } from '../utils/error';
import { prepareEvidenceSelection } from './evidenceSelection';

/** Only DocumentPicker cache copies belong to us; never delete a user's original. */
export function disposeEvidenceCache(uri: string): void {
  const cache = Paths?.cache?.uri;
  if (!cache || !uri.startsWith(`${cache.replace(/\/$/, '')}/`)) return;
  try { new File(uri).delete(); } catch { /* The OS may already have evicted this cache copy. */ }
}
export async function pickEvidenceSelections(count: number, isCurrent: () => boolean, imagesOnly = false): Promise<EvidenceSelection[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: imagesOnly ? ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] : '*/*', multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return [];
  try {
    if (!isCurrent()) { result.assets.forEach(file => disposeEvidenceCache(file.uri)); return []; }
    if (count + result.assets.length > MAX_EVIDENCE_FILES) throw new UserFacingError('증빙은 한 건에 최대 10개까지 첨부할 수 있어요.');
    const selections = result.assets.map(file => ({ id: randomUUID(), uri: file.uri, name: file.name, ...prepareEvidenceSelection(file) }));
    if (imagesOnly && selections.some(file => file.mimeType === 'application/pdf')) throw new UserFacingError('등록 전 증빙은 사진·이미지만 선택해주세요.');
    return selections;
  } catch (error) { result.assets.forEach(file => disposeEvidenceCache(file.uri)); throw error; }
}
