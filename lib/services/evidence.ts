import { supabase } from '../supabase';
import { UserFacingError } from '../utils/error';
import { EvidenceTarget, EvidenceFile, EvidenceSelection, EVIDENCE_BUCKET, evidencePath } from '../types/evidence';

export async function listEvidence(target: EvidenceTarget): Promise<EvidenceFile[]> {
  let query = supabase.from('transaction_evidence').select('*').eq('store_id', target.storeId);
  query = query.eq(target.kind === 'purchase' ? 'purchase_id' : target.kind === 'expense' ? 'expense_id' : 'recurring_rule_id', target.id);
  if (target.kind === 'recurring') query = query.eq('occurrence_month', target.month);
  const { data, error } = await query.order('created_at').order('id');
  if (error) throw error;
  return data as EvidenceFile[];
}

// Reserve an ID before any bytes are sent; retries use the same row and paths.
export async function reserveEvidence(target: EvidenceTarget, selection: EvidenceSelection): Promise<EvidenceFile> {
  const { data, error } = await supabase.rpc('reserve_transaction_evidence', {
    p_id: selection.id, p_store_id: target.storeId,
    p_purchase_id: target.kind === 'purchase' ? target.id : null,
    p_expense_id: target.kind === 'expense' ? target.id : null,
    p_rule_id: target.kind === 'recurring' ? target.id : null,
    p_month: target.kind === 'recurring' ? target.month : null,
    p_name: selection.name.slice(0, 200), p_mime: selection.mimeType === 'application/pdf' ? 'application/pdf' : 'image/jpeg',
  });
  if (error) throw error;
  return data as EvidenceFile;
}

export async function uploadEvidenceBytes(file: EvidenceFile, bytes: ArrayBuffer, thumbnail = false): Promise<void> {
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(evidencePath(file, thumbnail), bytes, {
    contentType: thumbnail ? 'image/jpeg' : file.mime_type, cacheControl: '0', upsert: true,
  });
  if (error) throw error;
}
export async function finishEvidence(id: string): Promise<void> {
  const { error } = await supabase.rpc('finish_transaction_evidence', { p_id: id });
  if (error) throw error;
}
export async function discardEvidence(file: EvidenceFile): Promise<void> {
  const { error } = await supabase.rpc('begin_ready_evidence_delete', { p_id: file.id });
  if (error) throw error;
  await removeClaimedEvidence(file);
}

async function removeClaimedEvidence(file: EvidenceFile): Promise<void> {
  const paths = [evidencePath(file), ...(file.mime_type === 'image/jpeg' ? [evidencePath(file, true)] : [])];
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).remove(paths);
  if (error) throw error;
  // The server checks actual object absence, including a silent Storage-policy rejection.
  const { error: deleteError } = await supabase.rpc('discard_transaction_evidence_metadata', { p_id: file.id });
  if (deleteError) throw deleteError;
}

/** User-requested cleanup only; a server claim prevents a concurrent finish/upload. */
export async function discardPendingEvidence(file: EvidenceFile): Promise<void> {
  const { error } = await supabase.rpc('begin_pending_evidence_discard', { p_id: file.id });
  if (error) throw error;
  await removeClaimedEvidence(file);
}

// Kept within a mounted, account-scoped panel (never persisted or global).
export async function signEvidence(file: EvidenceFile, thumbnail = false): Promise<string> {
  if (file.status !== 'ready') throw new UserFacingError('아직 업로드가 끝나지 않았어요.');
  const { data, error } = await supabase.functions.invoke('evidence-sign', { body: { id: file.id, thumbnail } });
  if (error) throw error;
  return data.signedUrl;
}

/** Validate parent deletion BEFORE removing any proof. Failed cleanup always leaves the transaction. */
export async function discardParentEvidence(kind: 'purchase' | 'expense' | 'recurring', id: string): Promise<void> {
  const { data, error } = await supabase.rpc('get_evidence_for_parent_delete', { p_kind: kind, p_id: id });
  if (error) throw error;
  if (!Array.isArray(data)) throw new UserFacingError('삭제 전 증빙을 확인하지 못했어요. 거래는 유지했으니 다시 시도해주세요.');
  for (const file of data as EvidenceFile[]) {
    try { await (file.status === 'ready' || file.status === 'deleting' ? discardEvidence(file) : discardPendingEvidence(file)); }
    catch { throw new UserFacingError('증빙 파일 정리를 완료하지 못해 거래를 삭제하지 않았어요. 일부 첨부는 삭제됐을 수 있으니 내역을 확인한 뒤 다시 시도해주세요.'); }
  }
}
