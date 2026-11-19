import { File } from 'expo-file-system';
import { evidenceSourceSizeAllowed } from '../types/evidence';
import { UserFacingError } from '../utils/error';

type PickedEvidence = { uri: string; name: string; mimeType?: string; size?: number };
const imageExtensions: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
const imageMimes = new Set(Object.values(imageExtensions));
/** Read only five header bytes for unknown types; never load a full document into JS. */
export function prepareEvidenceSelection(asset: PickedEvidence): { mimeType: string; size: number } {
  const mime = asset.mimeType?.toLowerCase().split(';')[0].trim() ?? '';
  const extension = asset.name.split('.').pop()?.toLowerCase() ?? '';
  let mimeType: string;
  if (mime === 'application/pdf' || extension === 'pdf') mimeType = 'application/pdf';
  else if (imageMimes.has(mime)) mimeType = mime;
  else {
    const handle = new File(asset.uri).open();
    let pdf: boolean;
    try {
      const bytes = handle.readBytes(5);
      pdf = bytes.length === 5 && bytes.every((byte, index) => byte === [37, 80, 68, 70, 45][index]);
    } finally { handle.close(); }
    mimeType = pdf ? 'application/pdf' : imageExtensions[extension] ?? '';
  }
  if (!mimeType) throw new UserFacingError('지원하는 이미지 또는 PDF 파일을 선택해주세요.');
  if (!evidenceSourceSizeAllowed(asset.size, mimeType)) throw new UserFacingError('이미지 원본은 25MiB, PDF는 10MiB 이하로 선택해주세요.');
  return { mimeType, size: asset.size! };
}
