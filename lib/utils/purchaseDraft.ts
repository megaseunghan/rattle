import type { ReceiptDraftRow } from '../components/PurchaseReceiptRows';

const MAX_ROWS = 300;
export const MAX_TOTAL = 1e12;
export const MAX_UNIT = 1e9;
const MAX_NAME = 200;

export interface DraftErrors {
  supplier?: string;
  form?: string;
  rows: Record<string, string>;
}

type ItemRow = { ingredient_id: string | null; name: string; quantity: number; category: string; unit: string; amount: number };
export type DraftPayload =
  | { mode: 'items'; rows: ItemRow[] }
  | { mode: 'amounts'; rows: { category: string; amount: number }[] };

export interface DraftInput {
  supplier: string;
  mode: 'items' | 'amounts';
  rows: ReceiptDraftRow[];
  amountRows: { category: string; value: string }[];
  total: number;
  type: string;
  category: string | undefined;
  categories: string[];
  taxonomyReady: boolean;
}

export type DraftResult = { ok: true; payload: DraftPayload } | { ok: false; errors: DraftErrors };

/** 품목 한 줄의 금액·수량 확인. 등록과 상세가 같은 규칙을 쓴다. */
export function itemAmountError(amountText: string, quantity: number): string | undefined {
  if (!/^\d+$/.test(amountText) || Number(amountText) >= MAX_TOTAL) return '금액을 입력해 주세요.';
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity >= MAX_UNIT) return '수량을 확인해 주세요.';
  const amount = Number(amountText);
  if (!Number.isSafeInteger(amount) || amount / quantity >= MAX_UNIT) return '금액을 확인해 주세요.';
  return undefined;
}

function rowError(row: ReceiptDraftRow, item: ItemRow, categories: string[]): string | undefined {
  if (!item.name) return '품목 이름을 입력해 주세요.';
  if (item.name.length > MAX_NAME) return '품목 이름을 200자 안으로 줄여 주세요.';
  if (!/^\d+$/.test(row.amount)) return '금액을 입력해 주세요.';
  if (!categories.includes(item.category)) return '카테고리를 골라 주세요.';
  return itemAmountError(row.amount, item.quantity);
}

/** 저장 전 입력 확인. 오류는 해당 칸 아래 빨간 글씨로 보여준다. */
export function validatePurchaseDraft(input: DraftInput): DraftResult {
  const errors: DraftErrors = { rows: {} };
  if (!input.supplier.trim()) errors.supplier = '거래처를 골라 주세요.';
  if (!input.taxonomyReady || !input.category || !input.categories.includes(input.category)) {
    errors.form = '매입 카테고리와 유형을 다시 불러와 주세요.';
  } else if (!input.type) errors.form = '매입 유형을 골라 주세요.';
  else if (input.total >= MAX_TOTAL) errors.form = '매입 합계를 확인해 주세요.';

  let payload: DraftPayload;
  if (input.mode === 'items') {
    const fallback = input.category ?? '';
    const items = input.rows.map(row => ({
      ingredient_id: row.ingredient?.id ?? null,
      name: (row.ingredient?.name ?? row.inputName ?? row.name).trim(),
      quantity: Number(row.quantity.trim() || 1),
      category: row.category ?? fallback,
      unit: row.ingredient?.unit ?? row.unit?.trim() ?? '',
      amount: Number(row.amount),
    }));
    if (!items.length) errors.form ??= '품목을 한 개 이상 추가해 주세요.';
    if (items.length > MAX_ROWS) errors.form ??= '품목은 한 번에 300개까지 저장할 수 있어요.';
    input.rows.forEach((row, index) => {
      const message = rowError(row, items[index], input.categories);
      if (message) errors.rows[row.id] = message;
    });
    payload = { mode: 'items', rows: items };
  } else {
    const filled = input.amountRows.filter(row => row.value);
    if (filled.some(row => !/^\d+$/.test(row.value))) errors.form ??= '금액은 원 단위 숫자로 입력해 주세요.';
    const rows = filled.map(row => ({ category: row.category, amount: Number(row.value) })).filter(row => row.amount > 0);
    if (!rows.length) errors.form ??= '카테고리에 금액을 입력해 주세요.';
    if (rows.length > MAX_ROWS) errors.form ??= '카테고리는 한 번에 300개까지 저장할 수 있어요.';
    payload = { mode: 'amounts', rows };
  }
  if (errors.supplier || errors.form || Object.keys(errors.rows).length) return { ok: false, errors };
  return { ok: true, payload };
}
