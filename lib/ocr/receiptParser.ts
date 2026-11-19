import type { RecognizedLine, TextBox } from '../../modules/rattle-text-recognition';

export interface ReceiptField<T> {
  value: T;
  sourceImageId: string;
  sourceBoxes: TextBox[];
  rawText: string;
  ocrConfidence: number | null;
  parserConfidence: number;
  source: 'observed' | 'derived';
  warnings: string[];
}
export interface ReceiptRow { text: string; cells: RecognizedLine[] }
export interface TotalCandidate extends ReceiptField<number> { label: string; score: number }
export interface ReceiptItem {
  name: ReceiptField<string>;
  quantity: ReceiptField<number> | null;
  unitPrice: ReceiptField<number> | null;
  amount: ReceiptField<number> | null;
  arithmeticMatches: boolean | null;
}
export interface ParsedReceipt {
  version: 1;
  sourceImageId: string;
  rotated: boolean;
  slope: number;
  rows: ReceiptRow[];
  totalCandidates: TotalCandidate[];
  /** Confirmed only by a labelled total and a unique independent calculation. */
  selectedTotal: TotalCandidate | null;
  /** Unverified, single observed total when no calculation materials exist. */
  suggestedTotal: TotalCandidate | null;
  dateCandidates: ReceiptField<string>[];
  vendorCandidates: ReceiptField<string>[];
  amounts: Record<'supply' | 'vat' | 'deposit' | 'returns' | 'goods' | 'shipping' | 'discount' | 'balance', ReceiptField<number> | null>;
  amountStatus: Record<keyof ParsedReceipt['amounts'], 'absent' | 'observed' | 'unreadable'>;
  items: ReceiptItem[];
  checks: { itemSum: number | null; itemsMatchTotal: boolean | null; supplyPlusVat: number | null; supplyVatMatchesTotal: boolean | null; goodsAdjustments: number | null; goodsAdjustmentsMatchTotal: boolean | null };
  warnings: string[];
}
const compact = (s: string) => s.replace(/\s/g, '');
const cx = (l: RecognizedLine) => l.box.x + l.box.w / 2;
const cy = (l: RecognizedLine) => l.box.y + l.box.h / 2;
const excluded = /전일잔액|미수잔액|이월|누적|잔액|최종입금|계좌|전화|사업자|등록번호/;

/** Preserve refund signs; malformed signs/grouping never become positive amounts. */
const normalizeMoney = (text: string) => text.normalize('NFKC').replace(/[\u2010-\u2015\u2212]/g, '-');
function wholeMoney(text: string): number | null {
  const normalized = normalizeMoney(text).trim();
  // Joining OCR cells must not silently concatenate two independent numbers.
  if (/\d\s+\d/.test(normalized)) return null;
  const token = normalized.replace(/\s/g, '');
  const parenthesized = token.startsWith('(') && token.endsWith(')');
  if ((token.includes('(') || token.includes(')')) && !parenthesized) return null;
  const inside = parenthesized ? token.slice(1, -1) : token;
  if (/[()]/.test(inside) || (inside.match(/[+-]/g)?.length ?? 0) > 1 || (parenthesized && inside.includes('+'))) return null;
  if (!/^(?:[+-]?[₩W]?|[₩W][+-]?)(?:\d{1,3}(?:[,.]\d{3})+|\d+)(?:원)?$/.test(inside)) return null;
  const numeric = Number(inside.replace(/[₩W,.원]/g, ''));
  return Number.isSafeInteger(numeric) ? (parenthesized ? -Math.abs(numeric) : numeric) : null;
}
function moneyValues(text: string, allowSmall: boolean): number[] {
  const normalized = normalizeMoney(text);
  const values: number[] = [];
  const tokens = /(?<![\d.,/+\-])(?:\(?\s*(?:[+-]\s*)?(?:[₩W]\s*)?(?:[+-]\s*)?(?:\d{1,3}(?:[,.]\s*\d{3})+|\d+)\s*(?:원)?\s*\)?)(?![\d.,/+\-])/g;
  for (const match of normalized.matchAll(tokens)) {
    const before = normalized.slice(0, match.index).trimEnd();
    const after = normalized.slice(match.index! + match[0].length).trimStart();
    if (/[()+-]$/.test(before) || /^[()+-]\s*$/.test(after)) continue;
    const value = wholeMoney(match[0]);
    if (value === null) continue;
    if (allowSmall || Math.abs(value) >= 1000 || /[,.원]/.test(match[0]) || normalized.trim() === match[0].trim()) values.push(value);
  }
  return values;
}
export function extractMoney(text: string): number[] { return moneyValues(text, false); }
function scalar(line: RecognizedLine): boolean { return wholeMoney(line.text) !== null; }

const columnNames = ['품목명[규격]', '품목명', '상품명', '공급가액', '부가세', '품명', '규격', '입수', 'BOX', 'EA', '단가', '금액', '수량', '단위', '비고'];
const joinableLabels = [...columnNames, '금일합계', '총결제금액', '결제금액', '청구금액', '총합계', '합계금액', '매출총계', '전일잔액', '미수잔액', '이월잔액', '총계', '합계'];
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Normalize geometry/segmentation without altering OCR digits or original source boxes. */
function prepare(lines: readonly RecognizedLine[]) {
  const rotated = lines.length > 0 && lines.filter(l => l.box.h > l.box.w * 1.2).length > lines.length * .55;
  const sourceLines = new Map<RecognizedLine, RecognizedLine[]>();
  const transformed: RecognizedLine[] = [];
  for (const original of lines) {
    const box = rotated ? { x: original.box.y, y: 1 - original.box.x - original.box.w, w: original.box.h, h: original.box.w } : { ...original.box };
    const text = compact(original.text).replace(/[|]/g, '');
    const tokens = text.match(/품목명\[규격\]|품목명|상품명|공급가액|부가세|품명|규격|입수|BOX|EA|단가|금액|수량|단위|비고/g) ?? [];
    // ML Kit may put several table headers into one observation. Approximate column positions only;
    // provenance always points to the complete original observation, never to an invented source box.
    const parts = tokens.length > 1 && tokens.join('') === text ? tokens : [original.text];
    let offset = 0;
    for (const part of parts) {
      const fraction = parts.length > 1 ? part.length / text.length : 1;
      const line = { ...original, text: part, box: { ...box, x: box.x + box.w * offset, w: box.w * fraction } };
      offset += fraction;
      sourceLines.set(line, [original]); transformed.push(line);
    }
  }
  const name = transformed.find(l => /^(상품명|품목명(?:\[규격\])?|품명)$/.test(compact(l.text)));
  const headerSlopes = name ? transformed.filter(l => columnNames.includes(compact(l.text)) && cx(l) > cx(name) + .15 && Math.abs(cy(l) - cy(name)) < .04)
    .map(l => (cy(l) - cy(name)) / (cx(l) - cx(name))).filter(value => Math.abs(value) < .15) : [];
  const slope = headerSlopes.length ? median(headerSlopes) : 0;
  const rowY = (l: RecognizedLine) => cy(l) - slope * cx(l);
  const groups: { y: number; h: number; cells: RecognizedLine[] }[] = [];
  for (const line of [...transformed].sort((a, b) => rowY(a) - rowY(b))) {
    let group = groups.filter(g => Math.abs(g.y - rowY(line)) < Math.min(g.h, line.box.h) * .55 + .003)
      .sort((a, b) => Math.abs(a.y - rowY(line)) - Math.abs(b.y - rowY(line)))[0];
    if (!group) { group = { y: rowY(line), h: line.box.h, cells: [] }; groups.push(group); }
    group.cells.push(line); group.y = median(group.cells.map(rowY));
  }
  const rows = groups.map(g => {
    const ordered = g.cells.sort((a, b) => a.box.x - b.box.x);
    const cells: RecognizedLine[] = [];
    for (let i = 0; i < ordered.length; i++) {
      let best = i, text = '';
      for (let j = i; j < Math.min(i + 8, ordered.length); j++) {
        if (j > i && ordered[j].box.x - (ordered[j - 1].box.x + ordered[j - 1].box.w) > .06) break;
        text += compact(ordered[j].text);
        if (!joinableLabels.some(label => label.startsWith(text))) break;
        if (joinableLabels.includes(text)) best = j;
      }
      if (best === i) { cells.push(ordered[i]); continue; }
      const sources = ordered.slice(i, best + 1);
      const x = Math.min(...sources.map(l => l.box.x)), y = Math.min(...sources.map(l => l.box.y));
      const confidences = sources.map(l => l.confidence).filter((n): n is number => n !== null);
      const merged: RecognizedLine = { text: sources.map(l => compact(l.text)).join(''), confidence: confidences.length ? Math.min(...confidences) : null,
        box: { x, y, w: Math.max(...sources.map(l => l.box.x + l.box.w)) - x, h: Math.max(...sources.map(l => l.box.y + l.box.h)) - y } };
      sourceLines.set(merged, sources.flatMap(l => sourceLines.get(l) ?? [l])); cells.push(merged); i = best;
    }
    return { text: cells.map(l => l.text).join(' '), cells };
  });
  return { rotated, slope, rows, sourceLines };
}

export function parseReceipt(lines: readonly RecognizedLine[], sourceImageId = 'image'): ParsedReceipt {
  const { rows, rotated, slope, sourceLines } = prepare(lines);
  const spaceNormalized = new Set<RecognizedLine>();
  const headerIndex = rows.findIndex(r => /품목명|상품명|품명/.test(compact(r.text)));
  const headers = headerIndex < 0 ? [] : rows[headerIndex].cells;
  const field = <T,>(value: T, cells: RecognizedLine[], confidence = .7, source: 'observed' | 'derived' = 'observed'): ReceiptField<T> => {
    const observations = [...new Set(cells.flatMap(l => sourceLines.get(l) ?? [l]))];
    const known = observations.map(l => l.confidence).filter((n): n is number => n !== null);
    return { value, sourceImageId, sourceBoxes: observations.map(l => ({ ...l.box })), rawText: observations.map(l => l.text).join(' '),
      ocrConfidence: known.length ? Math.min(...known) : null, parserConfidence: cells.some(l => spaceNormalized.has(l)) ? Math.min(confidence, .5) : confidence,
      source: cells.some(l => spaceNormalized.has(l)) ? 'derived' : source, warnings: cells.some(l => spaceNormalized.has(l)) ? ['금액 안의 공백을 천단위로 해석했어요. 원문을 확인해 주세요'] : [] };
  };
  const totalCandidates: TotalCandidate[] = [];
  let totalLabelCount = 0;
  const amounts: ParsedReceipt['amounts'] = { supply: null, vat: null, deposit: null, returns: null, goods: null, shipping: null, discount: null, balance: null };
  const amountCells = new Map<keyof typeof amounts, RecognizedLine[]>();
  const amountStatus = Object.fromEntries(Object.keys(amounts).map(key => [key, 'absent'])) as Record<keyof typeof amounts, 'absent' | 'observed' | 'unreadable'>;
  const dates: ReceiptField<string>[] = [];
  const vendors: ReceiptField<string>[] = [];
  const aliases: [string, RegExp][] = [['바른종합식자재', /바른종합식자재/], ['포도주류', /포도주류/], ['신선한 식탁', /신선한식탁/], ['수원축산', /수원축산/], ['쿠팡', /쿠팡/], ['네이버', /네이버/]];
  const semanticLabels: [keyof typeof amounts, RegExp][] = [
    ['balance', /전일잔액|미수잔액|이월|누적|잔액/], ['supply', /공급가(?:액)?/], ['vat', /부가세|세액|VAT/i],
    ['deposit', /보증금/], ['returns', /회수|공병반납|용기반납/], ['goods', /상품금액|상품액/], ['shipping', /배송비/], ['discount', /할인|쿠폰/],
  ];
  const summaryValue = (text: string, label: RecognizedLine, valueCells: RecognizedLine[]): number | null => {
    const normalized = normalizeMoney(text).trim()
      .replace(/^(?:총|[가-힣A-Za-z]+카드\s*\/\s*(?:일시불|일시물))\s*(?=[₩W(+\-\d])/, '')
      .replace(/\s+인수(?:자)?\s*$/, '');
    const observed = wholeMoney(normalized);
    if (observed !== null) return observed;
    if (valueCells.length === 1 && /^(?:[+-]\s*)?[₩W]?\s*\d{1,3}(?:\s+\d{3})+(?:\s*원)?$/.test(normalized)) {
      const value = wholeMoney(normalized.replace(/(\d)\s+(?=\d{3}(?:\D|$))/g, '$1,'));
      if (value !== null) {
        spaceNormalized.add(label);
        return value;
      }
    }
    return null;
  };
  // Only associate amounts inside the same row; crossing a balance row caused the Mac false total.
  const valueFor = (row: ReceiptRow, label: RecognizedLine): number | null => {
    const normalized = normalizeMoney(label.text);
    // Separate the label from its complete value; never pick one token from an ambiguous expression.
    if (/\d/.test(normalized)) {
      const start = normalized.search(/[₩W(+\-\d]/);
      return start < 0 ? null : summaryValue(normalized.slice(start), label, [label]);
    }
    const nextLabel = row.cells.find(l => cx(l) > cx(label) && /공급가|부가세|세액|VAT|보증금|회수|상품금액|배송비|할인|잔액|합계|총계|결제/.test(compact(l.text)));
    const right = row.cells.filter(l => l !== label && cx(l) > cx(label) && (!nextLabel || cx(l) < cx(nextLabel)));
    const signInLabel = normalized.match(/[+\-(]\s*$/)?.[0] ?? '';
    return right.length ? summaryValue(signInLabel + right.map(l => l.text).join(' '), label, right) : null;
  };
  for (const row of rows) {
    const isTableHeader = row.cells.filter(l => columnNames.includes(compact(l.text))).length >= 2 && !row.cells.some(l => wholeMoney(l.text) !== null);
    for (const cell of row.cells) {
      const text = compact(normalizeMoney(cell.text));
      for (const [key, pattern] of semanticLabels) {
        if (!isTableHeader && pattern.test(text)) {
          const value = valueFor(row, cell);
          if (value === null || (amounts[key] !== null && amounts[key]!.value !== value)) amountStatus[key] = 'unreadable';
          else {
            if (amountStatus[key] !== 'unreadable') amountStatus[key] = 'observed';
            if (amounts[key] === null) { amounts[key] = field(value, row.cells); amountCells.set(key, row.cells); }
          }
        }
      }
      if (!isTableHeader && !excluded.test(text)) {
        let score = /금일합계/.test(text) ? 120 : /총결제금액|결제금액|실결제|청구금액/.test(text) ? 110
          : /총합계|합계금액/.test(text) ? 100 : /매출총계|^총계(?:[₩W\d(+\-]|$)/.test(text) ? 90
          : /^합계(?:[₩W\d(+\-]|$)/.test(text) ? 65 : /주문금액/.test(text) ? 60 : 0;
        // A competing balance label invalidates ambiguous whole-row associations.
        if (row.cells.some(other => other !== cell && excluded.test(compact(other.text)))) score = 0;
        if (score) totalLabelCount += 1;
        const value = score ? valueFor(row, cell) : null;
        if (value !== null) {
          const candidate = { ...field(value, row.cells, score >= 100 ? .85 : .6), label: cell.text, score };
          totalCandidates.push(candidate);
        }
      }
      for (const m of cell.text.matchAll(/\b(20\d{2}|\d{2})\s*[-/.년]\s*(\d{1,2})\s*[-/.월]\s*(\d{1,2})(?:일|\b)/g)) {
        const year = Number(m[1].length === 2 ? `20${m[1]}` : m[1]);
        const month = Number(m[2]), day = Number(m[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
          const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          if (!dates.some(d => d.value === value)) dates.push(field(value, [cell], .5));
        }
      }
      for (const [alias, pattern] of aliases) {
        if (pattern.test(text) && !vendors.some(v => v.value === alias)) vendors.push(field(alias, [cell], .8));
      }
      if (/상호[:：]|공급자[:：]|거래처[:：]/.test(cell.text)) {
        const value = cell.text.replace(/^.*?(?:상호|공급자|거래처)\s*[:：]\s*/, '').trim();
        if (value && !vendors.some(v => v.value === value)) vendors.push(field(value, [cell], .65));
      }
    }
  }
  const items: ReceiptItem[] = [];
  const itemCells: RecognizedLine[] = [];
  const header = (pattern: RegExp) => headers.find(l => pattern.test(compact(l.text)));
  const quantityHeader = header(/^수량$|^중량$/), priceHeader = header(/^단가$/), amountHeader = header(/^금액$|^공급가액$|^합계$/);
  const findColumn = (row: ReceiptRow, column: RecognizedLine | undefined, quantity = false): ReceiptField<number> | null => {
    if (!column) return null;
    const cell = row.cells.filter(l => Math.abs(cx(l) - cx(column)) < Math.max(column.box.w / 2, .055))
      .sort((a, b) => Math.abs(cx(a) - cx(column)) - Math.abs(cx(b) - cx(column)))[0];
    if (!cell) return null;
    const value = quantity ? (/^\d+(?:\.\d+)?$/.test(compact(cell.text)) ? Number(compact(cell.text)) : null) : wholeMoney(cell.text);
    return value === null ? null : field(value, [cell]);
  };
  for (const [index, row] of rows.entries()) {
    if (headerIndex >= 0 && index > headerIndex && /공지사항|금일합계|총합계|송합계|손합계|매출총계|결제금액|전일잔액|미수잔액/.test(compact(row.text))) break;
    if (index <= headerIndex || excluded.test(compact(row.text)) || /합계|총계|공급가|부가세|보증금|회수|배송비|할인|결제|전화|주소|입금/.test(compact(row.text))) continue;
    const names = row.cells.filter(l => /[가-힣A-Za-z]/.test(l.text) && !/^[₩W\d.,\s]+원?$/.test(l.text) && l.box.x < .6);
    if (!names.length) continue;
    // Unlabelled document headers are not item rows. Require a table header or numbered item prefix.
    if (headerIndex < 0 && !/^\d+[.,)]\s*.*[가-힣]/.test(names[0].text)) continue;
    const name = field(names.map(l => l.text).join(' '), names, .6);
    const quantity = findColumn(row, quantityHeader, true);
    const unitPrice = findColumn(row, priceHeader);
    const fallback = [...row.cells].reverse().find(l => scalar(l) && l.box.x > Math.max(...names.map(n => n.box.x + n.box.w)));
    const amount = amountHeader ? findColumn(row, amountHeader) : (fallback ? field(extractMoney(fallback.text)[0], [fallback], .5) : null);
    const arithmeticMatches = quantity && unitPrice && amount ? Math.round(quantity.value * unitPrice.value) === amount.value : null;
    if (arithmeticMatches === false) amount?.warnings.push('수량 × 단가와 인쇄 금액이 달라요');
    items.push({ name, quantity, unitPrice, amount, arithmeticMatches });
    itemCells.push(...row.cells);
  }
  const itemSum = items.length && items.every(i => i.amount !== null) ? items.reduce((sum, i) => sum + i.amount!.value, 0) : null;
  // A provisional whitespace reading must not corroborate itself through tax
  // or goods equations. Keep the original value, but stop those calculations.
  for (const [key, cells] of amountCells) {
    if (cells.some(l => spaceNormalized.has(l))) amountStatus[key] = 'unreadable';
  }
  // Collect evidence before selecting anything. Candidate score and column
  // geometry are never a substitute for an independent arithmetic check.
  totalCandidates.sort((a, b) => b.score - a.score);
  const printedTotals = [...totalCandidates];
  const payableTotals = printedTotals.filter(c => !/매출합계|매출총계/.test(compact(c.label)));
  const isFinalPayment = (candidate: TotalCandidate) => /금일합계|결제|청구/.test(compact(candidate.label));
  type Equation = { value: number; cells: RecognizedLine[]; label: string; score: number };
  const equations: Equation[] = [];
  const cellsFor = (...keys: (keyof typeof amounts)[]) => keys.flatMap(key => amountCells.get(key) ?? []);
  const supplyPlusVat = amounts.supply && amounts.vat && amountStatus.supply === 'observed' && amountStatus.vat === 'observed'
    ? amounts.supply.value + amounts.vat.value : null;
  const adjustmentsKnown = amountStatus.shipping !== 'unreadable' && amountStatus.discount !== 'unreadable';
  const adjustment = adjustmentsKnown ? (amounts.shipping?.value ?? 0) - Math.abs(amounts.discount?.value ?? 0) : null;
  const goodsAdjustments = amounts.goods && amountStatus.goods === 'observed' && adjustment !== null
    ? amounts.goods.value + adjustment : null;
  const financialKeys = ['supply', 'vat', 'goods', 'shipping', 'discount', 'returns', 'deposit'] as const;
  const hasMaterials = items.length > 0 || amountStatus.balance !== 'absent'
    || financialKeys.some(key => amountStatus[key] !== 'absent')
    || printedTotals.some(c => /매출합계|매출총계|주문금액/.test(compact(c.label)));
  let incomplete = financialKeys.some(key => amountStatus[key] === 'unreadable')
    || items.some(item => item.amount === null) || totalLabelCount !== printedTotals.length;
  let totalConflict = items.some(i => i.arithmeticMatches === false);
  let supplyScopeUnknown = false;
  let supplyPayable: number | null = null;
  if (supplyPlusVat !== null && adjustment !== null) {
    if (amountStatus.goods === 'absent' && adjustment === 0) supplyPayable = supplyPlusVat;
    else if (amountStatus.goods === 'observed' && amounts.goods) {
      if (supplyPlusVat === amounts.goods.value) supplyPayable = goodsAdjustments;
      else if (supplyPlusVat === goodsAdjustments) supplyPayable = supplyPlusVat;
      else totalConflict = true;
    } else supplyScopeUnknown = true;
  } else if (amountStatus.supply !== 'absent' || amountStatus.vat !== 'absent') incomplete = true;
  if (supplyPayable !== null) equations.push({ value: supplyPayable, cells: cellsFor('supply', 'vat', 'goods', 'shipping', 'discount'),
    label: '공급가·부가세와 상품·조정 관계 (합계 라벨 확인)', score: 105 });
  if (goodsAdjustments !== null && amountStatus.returns === 'absent') equations.push({ value: goodsAdjustments,
    cells: cellsFor('goods', 'shipping', 'discount'), label: '상품 + 배송 − 할인 (합계 라벨 확인)', score: 105 });
  const grossRow = rows.find(r => /매출합계|매출총계/.test(compact(r.text)) && !excluded.test(compact(r.text)));
  let gross: number | null = null;
  if (grossRow) {
    const label = grossRow.cells.find(l => /매출합계|매출총계/.test(compact(l.text)))!;
    const value = valueFor(grossRow, label);
    if (!spaceNormalized.has(label)) gross = value;
  }
  if (amountStatus.returns !== 'absent') {
    if (gross !== null && amounts.returns && amountStatus.returns === 'observed') {
      equations.push({ value: gross - Math.abs(amounts.returns.value), cells: [...grossRow!.cells, ...cellsFor('returns')],
        label: '매출 − 회수 (결제 라벨 확인)', score: 115 });
      // A separate goods amount does not state whether returns are included.
      if (amountStatus.goods !== 'absent') incomplete = true;
    } else incomplete = true;
  }
  if (itemSum !== null && amountHeader && !items.some(i => i.arithmeticMatches === false) && adjustment !== null && amountStatus.returns === 'absent') {
    if (amountStatus.goods === 'observed' && amounts.goods) {
      if (itemSum !== amounts.goods.value) totalConflict = true;
    } else if (amountStatus.supply === 'absent' && amountStatus.vat === 'absent' && compact(amountHeader.text) !== '공급가액') {
      equations.push({ value: itemSum + adjustment, cells: [...itemCells, ...cellsFor('shipping', 'discount')],
        label: '품목 합계 + 배송 − 할인 (합계 라벨 확인)', score: 105 });
    } else if (supplyPlusVat !== null && itemSum !== amounts.supply?.value && itemSum !== supplyPlusVat) totalConflict = true;
  }
  const equationValues = new Set(equations.map(e => e.value));
  if (equationValues.size > 1) totalConflict = true;
  const expected = equationValues.size === 1 ? equations[0].value : null;
  // A generic total may include the separately observed previous balance.
  // A final-payment label still has to match the current payable exactly.
  const balanceOverall = expected !== null && amountStatus.balance === 'observed' && amounts.balance
    ? expected + amounts.balance.value : null;
  const subtotalValues = [amountStatus.goods === 'observed' ? amounts.goods?.value : null, supplyPlusVat, gross, balanceOverall];
  if (expected !== null && payableTotals.some(candidate => candidate.value !== expected
    && (isFinalPayment(candidate) || !subtotalValues.includes(candidate.value)))) totalConflict = true;
  const multipleTotals = new Set(payableTotals.filter(isFinalPayment).map(c => c.value)).size > 1
    || (expected === null && new Set(payableTotals.map(c => c.value)).size > 1);
  const matching = expected === null ? undefined : payableTotals.find(c => c.value === expected);
  let selectedTotal: TotalCandidate | null = null;
  let suggestedTotal: TotalCandidate | null = null;
  if (matching && !incomplete && !supplyScopeUnknown && !totalConflict && !multipleTotals) {
    selectedTotal = matching;
    const equation = [...equations].sort((a, b) => b.score - a.score)[0];
    const derived: TotalCandidate = { ...field(equation.value, equation.cells, .75, 'derived'), label: equation.label, score: equation.score };
    derived.parserConfidence = Math.min(derived.parserConfidence, matching.parserConfidence);
    derived.warnings = [...new Set([...derived.warnings, ...matching.warnings])];
    derived.sourceBoxes.push(...matching.sourceBoxes);
    derived.rawText += ` | ${matching.rawText}`;
    totalCandidates.push(derived);
    if (derived.score > matching.score) selectedTotal = derived;
  } else if (!hasMaterials && totalLabelCount === 1 && payableTotals.length === 1 && payableTotals[0].source === 'observed'
    && !/주문금액/.test(compact(payableTotals[0].label))) {
    suggestedTotal = { ...payableTotals[0], parserConfidence: Math.min(payableTotals[0].parserConfidence, .4),
      warnings: [...payableTotals[0].warnings, '영수증 합계를 확인해주세요'] };
  }
  totalCandidates.sort((a, b) => b.score - a.score);
  const unresolvedReturns = amountStatus.returns !== 'absent' && selectedTotal === null;
  const itemsMatchTotal = itemSum !== null && selectedTotal !== null ? itemSum === selectedTotal.value : null;
  const warnings = ['인식 결과를 원본과 확인해 주세요'];
  if (supplyScopeUnknown) warnings.push('공급가·부가세의 배송·할인 포함 여부를 확인해 주세요');
  if (spaceNormalized.size) warnings.push('공백 숫자의 독립 검산 근거를 확인해 주세요');
  if (suggestedTotal) warnings.push('영수증 합계를 확인해주세요');
  if (incomplete) warnings.push('검산 자료가 불완전해 합계를 확정하지 않았어요');
  if (unresolvedReturns) warnings.push('회수액 또는 실결제액이 미확인이라 매출총계를 결제 합계로 선택하지 않았어요');
  if (spaceNormalized.size) warnings.push('금액 안의 공백을 천단위로 해석했어요. 원문을 확인해 주세요');
  if (totalConflict) warnings.push('계산한 금액과 명시 결제·합계가 충돌해 합계를 확정하지 않았어요');
  const amountNames = { supply: '공급가', vat: '부가세', deposit: '보증금', returns: '회수액', goods: '상품금액', shipping: '배송비', discount: '할인', balance: '잔액' };
  for (const key of Object.keys(amountStatus) as (keyof typeof amounts)[]) {
    if (amountStatus[key] === 'unreadable') warnings.push(`${amountNames[key]} 라벨은 있지만 금액을 읽지 못했거나 서로 달라요`);
  }
  if (!selectedTotal) warnings.push('합계를 확인하지 못했어요');
  if (!items.length) warnings.push('품목 영역이 없거나 품목을 구분하지 못했어요');
  if (itemsMatchTotal === false) warnings.push('품목 합계와 선택 합계가 달라요 (세액·배송·할인·잘림 확인)');
  if (items.some(i => i.arithmeticMatches === false)) warnings.push('수량 × 단가와 인쇄 금액이 다른 품목이 있어요');
  if (multipleTotals) warnings.push('같은 우선순위 또는 명시 결제의 합계가 여러 개예요');
  if (amounts.deposit || amounts.returns) warnings.push('보증금·회수액의 매입 반영 기준은 별도 확인이 필요해요');
  return { version: 1, sourceImageId, rotated, slope, rows, totalCandidates, selectedTotal, suggestedTotal, dateCandidates: dates, vendorCandidates: vendors,
    amounts, amountStatus, items, checks: { itemSum, itemsMatchTotal, supplyPlusVat, supplyVatMatchesTotal: supplyPayable !== null && selectedTotal && supplyPayable === supplyPlusVat ? supplyPlusVat === selectedTotal.value : null,
      goodsAdjustments, goodsAdjustmentsMatchTotal: goodsAdjustments !== null && selectedTotal ? goodsAdjustments === selectedTotal.value : null }, warnings };
}
