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
  selectedTotal: TotalCandidate | null;
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

/** Work on clones: native coordinates remain available in the exported OCR. */
function prepare(lines: readonly RecognizedLine[]) {
  const rotated = lines.length > 0 && lines.filter(l => l.box.h > l.box.w * 1.2).length > lines.length * .55;
  const sourceBoxes = new Map<RecognizedLine, TextBox>();
  const transformed = lines.map(l => {
    const cell = { ...l, box: rotated
      ? { x: l.box.y, y: 1 - l.box.x - l.box.w, w: l.box.h, h: l.box.w }
      : { ...l.box } };
    sourceBoxes.set(cell, { ...l.box });
    return cell;
  });
  const name = transformed.find(l => /^(상품명|품목명(?:\[규격\])?)$/.test(compact(l.text)));
  const amount = name && transformed.filter(l => /^(금액|합계)$/.test(compact(l.text)) && cx(l) > cx(name) + .25 && Math.abs(cy(l) - cy(name)) < .04)
    .sort((a, b) => Math.abs(cy(a) - cy(name)) - Math.abs(cy(b) - cy(name)))[0];
  const slope = name && amount ? (cy(amount) - cy(name)) / (cx(amount) - cx(name)) : 0;
  // Deskew is used for row association only. Preserve transformed boxes for provenance.
  const rowY = (l: RecognizedLine) => cy(l) - slope * cx(l);
  const groups: { y: number; h: number; cells: RecognizedLine[] }[] = [];
  for (const line of [...transformed].sort((a, b) => rowY(a) - rowY(b))) {
    let group = groups.find(g => Math.abs(g.y - rowY(line)) < Math.min(g.h, line.box.h) * .55 + .003);
    if (!group) { group = { y: rowY(line), h: line.box.h, cells: [] }; groups.push(group); }
    group.cells.push(line);
  }
  const rows = groups.map(g => {
    const cells = g.cells.sort((a, b) => a.box.x - b.box.x);
    return { text: cells.map(l => l.text).join(' '), cells };
  });
  return { rotated, slope, rows, sourceBoxes };
}

export function parseReceipt(lines: readonly RecognizedLine[], sourceImageId = 'image'): ParsedReceipt {
  const { rows, rotated, slope, sourceBoxes } = prepare(lines);
  const field = <T,>(value: T, cells: RecognizedLine[], confidence = .7, source: 'observed' | 'derived' = 'observed'): ReceiptField<T> => {
    const known = cells.map(l => l.confidence).filter((n): n is number => n !== null);
    return { value, sourceImageId, sourceBoxes: cells.map(l => ({ ...(sourceBoxes.get(l) ?? l.box) })), rawText: cells.map(l => l.text).join(' '),
      ocrConfidence: known.length ? Math.min(...known) : null, parserConfidence: confidence, source, warnings: [] };
  };
  const totalCandidates: TotalCandidate[] = [];
  const amounts: ParsedReceipt['amounts'] = { supply: null, vat: null, deposit: null, returns: null, goods: null, shipping: null, discount: null, balance: null };
  const amountStatus = Object.fromEntries(Object.keys(amounts).map(key => [key, 'absent'])) as Record<keyof typeof amounts, 'absent' | 'observed' | 'unreadable'>;
  const dates: ReceiptField<string>[] = [];
  const vendors: ReceiptField<string>[] = [];
  const aliases: [string, RegExp][] = [['바른종합식자재', /바른종합식자재/], ['포도주류', /포도주류/], ['신선한 식탁', /신선한식탁/], ['수원축산', /수원축산/], ['쿠팡', /쿠팡/], ['네이버', /네이버/]];
  const semanticLabels: [keyof typeof amounts, RegExp][] = [
    ['balance', /전일잔액|미수잔액|이월|누적|잔액/], ['supply', /공급가(?:액)?/], ['vat', /부가세|세액|VAT/i],
    ['deposit', /보증금/], ['returns', /회수|공병반납|용기반납/], ['goods', /상품금액|상품액/], ['shipping', /배송비/], ['discount', /할인|쿠폰/],
  ];
  // Only associate amounts inside the same row; crossing a balance row caused the Mac false total.
  const valueFor = (row: ReceiptRow, label: RecognizedLine): number | null => {
    const normalized = normalizeMoney(label.text);
    // Separate the label from its complete value; never pick one token from an ambiguous expression.
    if (/\d/.test(normalized)) {
      const start = normalized.search(/[₩W(+\-\d]/);
      return start < 0 ? null : wholeMoney(normalized.slice(start));
    }
    const nextLabel = row.cells.find(l => cx(l) > cx(label) && /공급가|부가세|세액|VAT|보증금|회수|상품금액|배송비|할인|잔액|합계|총계|결제/.test(compact(l.text)));
    const right = row.cells.filter(l => l !== label && cx(l) > cx(label) && (!nextLabel || cx(l) < cx(nextLabel)));
    const signInLabel = normalized.match(/[+\-(]\s*$/)?.[0] ?? '';
    return right.length ? wholeMoney(signInLabel + right.map(l => l.text).join(' ')) : null;
  };
  for (const row of rows) {
    for (const cell of row.cells) {
      const text = compact(normalizeMoney(cell.text));
      for (const [key, pattern] of semanticLabels) {
        if (pattern.test(text)) {
          const value = valueFor(row, cell);
          if (value === null || (amounts[key] !== null && amounts[key]!.value !== value)) amountStatus[key] = 'unreadable';
          else {
            if (amountStatus[key] !== 'unreadable') amountStatus[key] = 'observed';
            if (amounts[key] === null) amounts[key] = field(value, row.cells);
          }
        }
      }
      if (!excluded.test(text)) {
        let score = /금일합계/.test(text) ? 120 : /총결제금액|결제금액|실결제|청구금액/.test(text) ? 110
          : /총합계|합계금액/.test(text) ? 100 : /매출총계|^총계(?:[₩W\d(+\-]|$)/.test(text) ? 90
          : /^합계(?:[₩W\d(+\-]|$)/.test(text) ? 65 : /주문금액/.test(text) ? 60 : 0;
        // A competing balance label invalidates ambiguous whole-row associations.
        if (row.cells.some(other => other !== cell && excluded.test(compact(other.text)))) score = 0;
        const value = score ? valueFor(row, cell) : null;
        if (value !== null) totalCandidates.push({ ...field(value, row.cells, score >= 100 ? .85 : .6), label: cell.text, score });
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
  totalCandidates.sort((a, b) => b.score - a.score);
  let selectedTotal: TotalCandidate | null = totalCandidates[0] ?? null;
  const observedTotals = totalCandidates.filter(c => !/매출합계|매출총계|주문금액/.test(compact(c.label)));
  let totalConflict = false;
  const verifyDerived = (value: number, cells: RecognizedLine[], label: string, score: number) => {
    // A unit price, cash received or an unlabelled number cannot corroborate a total.
    const matching = observedTotals.find(candidate => candidate.value === value);
    if (observedTotals.some(candidate => candidate.value !== value)) totalConflict = true;
    if (!matching) return;
    const candidate: TotalCandidate = { ...field(value, cells, .75, 'derived'), label, score };
    candidate.sourceBoxes.push(...matching.sourceBoxes);
    candidate.rawText += ` | ${matching.rawText}`;
    totalCandidates.push(candidate);
    if (!selectedTotal || selectedTotal.score < score) selectedTotal = candidate;
  };
  const supplyPlusVat = amounts.supply && amounts.vat && amountStatus.supply === 'observed' && amountStatus.vat === 'observed'
    ? amounts.supply.value + amounts.vat.value : null;
  if (supplyPlusVat !== null) {
    const cells = rows.filter(r => r.text === amounts.supply?.rawText || r.text === amounts.vat?.rawText).flatMap(r => r.cells);
    verifyDerived(supplyPlusVat, cells, '공급가 + 부가세 (합계 라벨 확인)', 105);
  }
  const grossRow = rows.find(r => /매출합계|매출총계/.test(compact(r.text)) && !excluded.test(compact(r.text)));
  if (grossRow && amounts.returns && amountStatus.returns === 'observed') {
    const label = grossRow.cells.find(l => /매출합계|매출총계/.test(compact(l.text)))!;
    const gross = valueFor(grossRow, label);
    const net = gross === null ? null : gross - Math.abs(amounts.returns.value);
    if (net !== null) verifyDerived(net, grossRow.cells, '매출 − 회수 (결제 라벨 확인)', 115);
  }
  if (totalConflict) selectedTotal = null;
  const items: ReceiptItem[] = [];
  const headerIndex = rows.findIndex(r => /품목명|상품명/.test(compact(r.text)));
  const headers = headerIndex < 0 ? [] : rows[headerIndex].cells;
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
  }
  const itemSum = items.length && items.every(i => i.amount !== null) ? items.reduce((sum, i) => sum + i.amount!.value, 0) : null;
  const itemsMatchTotal = itemSum !== null && selectedTotal !== null ? itemSum === selectedTotal.value : null;
  const goodsAdjustments = amounts.goods && amountStatus.goods === 'observed' && amountStatus.shipping !== 'unreadable' && amountStatus.discount !== 'unreadable'
    ? amounts.goods.value + (amounts.shipping?.value ?? 0) - Math.abs(amounts.discount?.value ?? 0) : null;
  const warnings = ['인식 결과를 원본과 확인해 주세요'];
  if (totalConflict) warnings.push('계산한 금액과 명시 결제·합계가 충돌해 합계를 확정하지 않았어요');
  const amountNames = { supply: '공급가', vat: '부가세', deposit: '보증금', returns: '회수액', goods: '상품금액', shipping: '배송비', discount: '할인', balance: '잔액' };
  for (const key of Object.keys(amountStatus) as (keyof typeof amounts)[]) {
    if (amountStatus[key] === 'unreadable') warnings.push(`${amountNames[key]} 라벨은 있지만 금액을 읽지 못했거나 서로 달라요`);
  }
  if (!selectedTotal) warnings.push('합계를 확인하지 못했어요');
  if (!items.length) warnings.push('품목 영역이 없거나 품목을 구분하지 못했어요');
  if (itemsMatchTotal === false) warnings.push('품목 합계와 선택 합계가 달라요 (세액·배송·할인·잘림 확인)');
  if (items.some(i => i.arithmeticMatches === false)) warnings.push('수량 × 단가와 인쇄 금액이 다른 품목이 있어요');
  if (new Set(totalCandidates.filter(c => c.score === selectedTotal?.score).map(c => c.value)).size > 1) warnings.push('같은 우선순위의 합계가 여러 개예요');
  if (amounts.deposit || amounts.returns) warnings.push('보증금·회수액의 매입 반영 기준은 별도 확인이 필요해요');
  return { version: 1, sourceImageId, rotated, slope, rows, totalCandidates, selectedTotal, dateCandidates: dates, vendorCandidates: vendors,
    amounts, amountStatus, items, checks: { itemSum, itemsMatchTotal, supplyPlusVat, supplyVatMatchesTotal: supplyPlusVat !== null && selectedTotal ? supplyPlusVat === selectedTotal.value : null,
      goodsAdjustments, goodsAdjustmentsMatchTotal: goodsAdjustments !== null && selectedTotal ? goodsAdjustments === selectedTotal.value : null }, warnings };
}
