import { PURCHASE_OCR_ENABLED } from '../ocr/purchaseOcrFlag';
import { useEffect, useMemo, useRef, useState } from 'react';
import { recognizeText } from '../../modules/rattle-text-recognition';
import { parseReceipt, type ParsedReceipt } from '../ocr/receiptParser';
import type { EvidenceSelection } from '../types/evidence';

// Provisional PL policy. Only independently checked totals may prefill the comparison.
export const PURCHASE_RECEIPT_POLICY = { prefillSelected: true } as const;

type Reading = { receipt: ParsedReceipt } | { error: string };

function readFailure(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'ERR_OCR_UNAVAILABLE') return '이 기기에서 영수증 인식을 사용할 수 없어요. 직접 입력해주세요.';
  if (/PERMISSION|DENIED/i.test(code)) return '사진을 읽을 권한이 없어요. 설정에서 허용하거나 다른 사진을 선택해주세요.';
  return '영수증을 읽지 못했어요. 선명한 사진을 선택하거나 직접 입력해주세요.';
}

export function usePurchaseReceipt(selections: EvidenceSelection[]) {
  const files = useMemo(() => PURCHASE_OCR_ENABLED ? selections.filter(file => file.mimeType !== 'application/pdf') : [], [selections]);
  const [results, setResults] = useState<Record<string, Reading>>({});
  const [manual, setManual] = useState<{ source: string; value: string } | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const next = files.find(file => !results[file.id]);
  useEffect(() => {
    if (!next) return;
    let current = true;
    // Native recognition accepts one job at a time, including canceled reads still finishing.
    queue.current = queue.current.then(async () => {
      if (!current) return;
      let result: Reading;
      try {
        const { lines } = await recognizeText(next.uri);
        if (!lines.length) throw new Error('empty');
        result = { receipt: parseReceipt(lines, next.id) };
      } catch (error) {
        result = { error: readFailure(error) };
      }
      if (current) setResults(previous => ({ ...previous, [next.id]: result }));
    });
    return () => { current = false; };
  }, [next]);
  useEffect(() => {
    const ids = new Set(files.map(file => file.id));
    setResults(previous => Object.keys(previous).some(id => !ids.has(id))
      ? Object.fromEntries(Object.entries(previous).filter(([id]) => ids.has(id))) : previous);
    setManual(previous => previous && !ids.has(previous.source) ? null : previous);
  }, [files]);
  const readings = useMemo(() => files.map(file => ({ file, result: results[file.id] })), [files, results]);
  const single = readings.length === 1 ? readings[0].result : null;
  const selected = single && 'receipt' in single && !single.receipt.guidanceCodes.includes('WHOLE_ORDER_TOTAL')
    ? single.receipt.selectedTotal : null;
  const manualCurrent = manual && files.some(file => file.id === manual.source);
  const total = manualCurrent ? manual.value : PURCHASE_RECEIPT_POLICY.prefillSelected && selected ? String(selected.value) : '';
  function changeTotal(value: string, source = files[0]?.id) {
    if (source) setManual({ source, value });
  }
  function retry(id: string) {
    setResults(previous => {
      const remaining = { ...previous };
      delete remaining[id];
      return remaining;
    });
  }
  return { readings, total, changeTotal, retry, busy: !!next };
}
