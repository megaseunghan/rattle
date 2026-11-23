/* design-system: DESIGN.md — 매입 등록 증빙 사진(저장 전 기기 보관). 사진만 받는다(2026-11-21 PDF 제외). */
import { useEffect, useRef, useState } from 'react';
import { EvidenceSelection, MAX_EVIDENCE_FILES } from '../types/evidence';
import { pickEvidenceSelections } from '../media/evidencePicker';
import { getErrorMessage } from '../utils/error';
import { EvidenceLocalPreview } from './EvidenceLocalPreview';
import { EvidencePhotoCard, EvidenceSourceSheet, PhotoThumb, photoStyles, type PhotoSource } from './purchase/EvidencePhotoCard';
import { FieldError } from './purchase/PurchaseUi';

/** Local-only controlled draft. Its parent owns cache lifetime across save. */
export function EvidenceStagingPanel({ files, onChange, disabled = false, onPickingChange }: {
  files: EvidenceSelection[]; onChange: (files: EvidenceSelection[]) => void; disabled?: boolean; onPickingChange?: (picking: boolean) => void;
}) {
  const [picking, setPicking] = useState(false), [error, setError] = useState(''), [sheet, setSheet] = useState(false);
  const alive = useRef(true), lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onPickingChange?.(false); }; }, []);
  async function pick(source: PhotoSource) {
    if (disabled || lock.current) return;
    lock.current = true; setPicking(true); onPickingChange?.(true); setError('');
    try {
      const selected = await pickEvidenceSelections(files.length, () => alive.current, source);
      if (alive.current && selected.length) onChange([...files, ...selected]);
    } catch (pickError) {
      if (alive.current) setError(getErrorMessage(pickError));
    } finally { lock.current = false; if (alive.current) { setPicking(false); onPickingChange?.(false); } }
  }
  return <>
    <EvidencePhotoCard count={files.length} disabled={disabled || picking} onAdd={() => setSheet(true)} footer={<FieldError message={error} />}>
      {files.map(item => <PhotoThumb key={item.id} removeLabel={`${item.name} 빼기`} removeDisabled={disabled || picking}
        onRemove={disabled ? undefined : () => onChange(files.filter(file => file.id !== item.id))}>
        <EvidenceLocalPreview selection={item} style={photoStyles.fill} fit="cover" />
      </PhotoThumb>)}
    </EvidencePhotoCard>
    <EvidenceSourceSheet visible={sheet} remaining={MAX_EVIDENCE_FILES - files.length} onClose={() => setSheet(false)} onPick={source => { void pick(source); }} />
  </>;
}
