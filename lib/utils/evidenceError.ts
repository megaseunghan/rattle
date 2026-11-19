import { UserFacingError } from './error';

export class EvidenceReuploadRequired extends Error {}

export interface EvidenceFailure { kind: string; message: string; retryable: boolean }
export function evidenceFailure(error: unknown): EvidenceFailure {
  const value = error && typeof error === 'object' ? error as { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown } : {};
  const message = typeof value.message === 'string' ? value.message : '';
  if (message.includes('EVIDENCE_LIMIT')) return { kind: 'limit', message: '증빙은 최대 10개예요. 불필요한 첨부나 미완료 파일을 정리한 뒤 다시 선택해주세요.', retryable: false };
  if (message.includes('EVIDENCE_NO_OCCURRENCE')) return { kind: 'occurrence', message: '이 월에는 발생하는 고정비가 없어요. 적용월·종료월을 확인해주세요.', retryable: false };
  if (value.code === '42501' || String(value.status ?? value.statusCode) === '403' || message.includes('EVIDENCE_FORBIDDEN')) return { kind: 'forbidden', message: '증빙을 변경할 권한이 없어요. 매장과 직원 연결 상태를 관리자에게 확인해주세요.', retryable: false };
  if (message.includes('EVIDENCE_SCOPE_CHANGED')) return { kind: 'scope', message: '계정 또는 매장이 바뀌어 업로드를 중단했어요.', retryable: false };
  if (message.includes('EVIDENCE_ID_CONFLICT')) return { kind: 'conflict', message: '첨부 대상이 달라졌어요. 목록을 다시 불러온 뒤 파일을 다시 선택해주세요.', retryable: false };
  if (error instanceof UserFacingError) return { kind: 'input', message: error.message, retryable: false };
  return { kind: 'upload', message: '업로드하지 못했어요. 연결 상태를 확인한 뒤 이 파일만 다시 시도해주세요. 거래는 저장되어 있어요.', retryable: true };
}
/** Do not log filenames, URLs, raw backend errors, user IDs or document contents. */
export function logEvidenceFailure(failure: EvidenceFailure): void {
  console.warn('evidence_upload_failed', { kind: failure.kind, retryable: failure.retryable });
}
