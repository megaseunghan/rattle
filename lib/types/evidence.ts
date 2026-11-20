export type EvidenceTarget = { storeId: string } & (
  | { kind: 'purchase' | 'expense'; id: string; month?: never }
  | { kind: 'recurring'; id: string; month: string }
);
export interface EvidenceFile {
  id: string;
  store_id: string;
  purchase_id: string | null;
  expense_id: string | null;
  recurring_rule_id: string | null;
  occurrence_month: string | null;
  name: string;
  mime_type: 'image/jpeg' | 'application/pdf';
  status: 'pending' | 'ready' | 'discarding' | 'deleting';
  created_by: string;
  created_at: string;
}
export interface EvidenceSelection { id: string; uri: string; name: string; mimeType: string; size: number }
export const EVIDENCE_BUCKET = 'transaction-evidence';
export const MAX_EVIDENCE_FILES = 10;
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export function evidencePath(file: EvidenceFile, thumbnail = false): string {
  return `${file.store_id}/${file.id}/${thumbnail ? 'thumb.jpg' : file.mime_type === 'application/pdf' ? 'document.pdf' : 'image.jpg'}`;
}

// Provisional source-file cap, not a measured native memory safety threshold.
export const MAX_EVIDENCE_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024;
export function evidenceSourceSizeAllowed(size: number | undefined, mimeType: string): boolean {
  const limit = mimeType.startsWith('image/') ? MAX_EVIDENCE_IMAGE_SOURCE_BYTES : MAX_EVIDENCE_BYTES;
  return typeof size === 'number' && Number.isFinite(size) && size > 0 && size <= limit;
}
