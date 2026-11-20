import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { EvidenceSelection, EvidenceFile, MAX_EVIDENCE_BYTES, evidenceSourceSizeAllowed } from '../types/evidence';
import { uploadEvidenceBytes, finishEvidence } from '../services/evidence';
import { UserFacingError } from '../utils/error';

async function readBounded(uri: string): Promise<ArrayBuffer> {
  const file = new File(uri);
  if (!file.size || file.size > MAX_EVIDENCE_BYTES) throw new UserFacingError('파일은 10MB 이하로 선택해주세요.');
  return file.arrayBuffer();
}

export async function uploadEvidence(selection: EvidenceSelection, row: EvidenceFile, isCurrent: () => boolean): Promise<void> {
  const check = () => { if (!isCurrent()) throw new Error('EVIDENCE_SCOPE_CHANGED'); };
  check();
  if (row.status === 'discarding' || row.status === 'deleting') throw new UserFacingError('정리 중인 첨부예요. 미완료 첨부 정리를 마친 뒤 다시 선택해주세요.');
  if (row.status === 'ready') return; // A previous finish response may have been lost.
  if (row.mime_type === 'application/pdf') {
    const bytes = await readBounded(selection.uri); check();
    await uploadEvidenceBytes(row, bytes); check();
  } else {
    // Decode with a native target size before handing a shared image to the manipulator.
    // Passing the original URI to the manipulator would decode it at full resolution.
    if (!evidenceSourceSizeAllowed(new File(selection.uri).size, 'image/jpeg')) {
      throw new UserFacingError('이미지 원본은 25MiB 이하로 선택해주세요.');
    }
    let source: Awaited<ReturnType<typeof Image.loadAsync>> | undefined;
    let context: ReturnType<typeof ImageManipulator.manipulate> | undefined;
    let image: Awaited<ReturnType<ReturnType<typeof ImageManipulator.manipulate>['renderAsync']>> | undefined;
    const files: string[] = [];
    try {
      source = await Image.loadAsync(selection.uri, { maxWidth: 2000, maxHeight: 2000 });
      check();
      context = ImageManipulator.manipulate(source);
      if (Math.max(source.width, source.height) > 2000) {
        context.resize(source.width >= source.height ? { width: 2000 } : { height: 2000 });
      }
      image = await context.renderAsync();
      check();
      const full = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
      files.push(full.uri); check();
      const bytes = await readBounded(full.uri); check();
      await uploadEvidenceBytes(row, bytes); check();
      context.resize({ width: Math.max(1, Math.round(image.width * Math.min(1, 384 / Math.max(image.width, image.height)))), height: Math.max(1, Math.round(image.height * Math.min(1, 384 / Math.max(image.width, image.height)))) });
      const thumb = await context.renderAsync();
      try {
        const saved = await thumb.saveAsync({ format: SaveFormat.JPEG, compress: 0.65 });
        files.push(saved.uri); check();
        const thumbBytes = await readBounded(saved.uri); check();
        await uploadEvidenceBytes(row, thumbBytes, true); check();
      } finally { thumb.release(); }
    } finally {
      image?.release(); context?.release(); source?.release();
      for (const uri of files) { try { new File(uri).delete(); } catch { /* OS cache cleanup remains safe to retry. */ } }
    }
  }
  check(); await finishEvidence(row.id);
}
