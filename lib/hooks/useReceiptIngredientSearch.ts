import { useEffect, useRef, useState } from 'react';
import type { Ingredient } from '../../types';
import { getIngredients } from '../services/ingredients';

const PAGE = 100;
type Result = { storeId: string; term: string; matches?: Ingredient[]; failed?: boolean };

// Search locally so even an unedited OCR name stays on the device.
export function useReceiptIngredientSearch(storeId: string, term: string, inventory: Ingredient[], complete: boolean) {
  const [result, setResult] = useState<Result>();
  const [attempt, setAttempt] = useState(0);
  const catalog = useRef<{ storeId: string; source: Ingredient[]; rows: Ingredient[] } | null>(null);
  useEffect(() => {
    if (!term || !storeId) return;
    const controller = new AbortController();
    const { signal } = controller;
    async function search() {
      try {
        let rows = complete ? inventory : catalog.current?.storeId === storeId && catalog.current.source === inventory ? catalog.current.rows : undefined;
        if (!rows) {
          rows = [];
          for (let page = 0; ; page++) {
            const batch = await getIngredients(storeId, page, PAGE, signal);
            if (signal.aborted) return;
            rows.push(...batch);
            if (batch.length < PAGE) break;
          }
          catalog.current = { storeId, source: inventory, rows };
        }
        const needle = term.toLocaleLowerCase();
        const matches = rows.filter(row => row.name.toLocaleLowerCase().includes(needle));
        setResult({ storeId, term, matches });
      } catch {
        if (!signal.aborted) setResult({ storeId, term, failed: true });
      }
    }
    const timer = setTimeout(() => { void search(); }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [storeId, term, inventory, complete, attempt]);
  return { result: result?.storeId === storeId && result.term === term ? result : undefined,
    retry: () => { setResult(undefined); setAttempt(previous => previous + 1); } };
}
