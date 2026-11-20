import type { RecognizedLine, TextBox } from '../../modules/rattle-text-recognition';

export interface MoneyToken {
  /** Index in this source image's original OCR observation array. */
  observationId: number;
  /** UTF-16 offsets in that observation's original text; end is exclusive. */
  start: number;
  end: number;
}
export interface ReceiptField<T> {
  value: T;
  sourceImageId: string;
  sourceBoxes: TextBox[];
  rawText: string;
  ocrConfidence: number | null;
  parserConfidence: number;
  source: 'observed' | 'derived';
  moneyTokens?: MoneyToken[];
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
export type ReceiptGuidanceCode = 'PAYMENT_SCREEN_REQUIRED' | 'WHOLE_ORDER_TOTAL' | 'INVALID_THOUSANDS_GROUPING';
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
  guidanceCodes: ReceiptGuidanceCode[];
  warnings: string[];
}
const compact = (s: string) => s.replace(/\s/g, '');
const cx = (l: RecognizedLine) => l.box.x + l.box.w / 2;
const cy = (l: RecognizedLine) => l.box.y + l.box.h / 2;
const excluded = /전일잔액|전일채권|미수잔액|이월|누적|누계|잔액|최종입금|계좌|전화|사업자|등록번호/;

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

const columnNames = ['품목명[규격]', '품목명', '상품명', '공급가액', '공급가', '부가세', '보증금', '매출합계', '품명', '규격', '입수', 'BOX', 'EA', '단가', '금액', '수량', '단위', '비고'];
const joinableLabels = [...columnNames, '금일합계', '총결제금액', '결제금액', '청구금액', '총합계', '합계금액', '매출총계', '전일잔액', '미수잔액', '이월잔액', '총계', '합계'];
const summaryLabels = /금일합계|총결제금액|결제금액|실결제|청구금액|총합계|합계금액|매출총계|매출합계|상품금액|상품액|주문금액|공급가액|공급가|부가세|세액|VAT|보증금|공병반납|용기반납|회수(?:액)?|배송비|할인|쿠폰|전일잔액|미수잔액|이월잔액|잔액|총계|합계/gi;
const numericTokens = /[0-9]+(?:[,.]\s*[0-9]+)*(?:\s+[0-9]{3})*/g;
function normalizedOffsets(text: string) {
  let normalized = '', offset = 0;
  const starts: number[] = [], ends: number[] = [];
  for (const character of text) {
    const part = normalizeMoney(character);
    normalized += part;
    for (let i = 0; i < part.length; i++) { starts.push(offset); ends.push(offset + character.length); }
    offset += character.length;
  }
  return { text: normalized, starts, ends };
}
const disjoint = (groups: readonly (readonly MoneyToken[])[]) => groups.every((group, index) => group.length > 0 &&
  groups.slice(0, index).every(previous => group.every(token => previous.every(other => token.observationId !== other.observationId
    || token.end <= other.start || other.end <= token.start))));
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Normalize geometry/segmentation without altering OCR digits or original source boxes. */
function prepare(lines: readonly RecognizedLine[]) {
  const rotated = lines.length > 0 && lines.filter(l => l.box.h > l.box.w * 1.2).length > lines.length * .55;
  const sourceLines = new Map<RecognizedLine, RecognizedLine[]>();
  const transformed: RecognizedLine[] = [];
  for (const original of lines) {
    const box = rotated ? { x: original.box.y, y: 1 - original.box.x - original.box.w, w: original.box.h, h: original.box.w } : { ...original.box };
    const text = compact(original.text).replace(/[|]/g, '');
    const tokens = text.match(/품목명\[규격\]|품목명|상품명|공급가(?:액)?|부가세|보증금|매출합계|품명|규격|입수|BOX|EA|단가|금액|수량|단위|비고/g) ?? [];
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
  const observationTokens = new Map<RecognizedLine, { token: MoneyToken; start: number; end: number }[]>();
  lines.forEach((line, observationId) => {
    const mapped = normalizedOffsets(line.text);
    observationTokens.set(line, [...mapped.text.matchAll(numericTokens)].map(match => ({
      token: { observationId, start: mapped.starts[match.index!], end: mapped.ends[match.index! + match[0].length - 1] },
      start: match.index!, end: match.index! + match[0].length,
    })));
  });
  const tokensFor = (cell: RecognizedLine, start = 0, end = Infinity): MoneyToken[] => (sourceLines.get(cell) ?? [cell]).flatMap(original =>
    (observationTokens.get(original) ?? []).filter(token => cell.text !== original.text || (token.start >= start && token.end <= end)).map(token => ({ ...token.token })));
  const spaceNormalized = new Set<RecognizedLine>();
  const invalidGrouping = new Set<RecognizedLine>();
  const invalidTotalCandidates = new Set<TotalCandidate>();
  const headerIndex = rows.findIndex(r => /품목명|상품명|품명/.test(compact(r.text)));
  const headers = headerIndex < 0 ? [] : rows[headerIndex].cells;
  const field = <T,>(value: T, cells: RecognizedLine[], confidence = .7, source: 'observed' | 'derived' = 'observed', moneyTokens: MoneyToken[] = []): ReceiptField<T> => {
    const observations = [...new Set(cells.flatMap(l => sourceLines.get(l) ?? [l]))];
    const known = observations.map(l => l.confidence).filter((n): n is number => n !== null);
    return { value, sourceImageId, sourceBoxes: observations.map(l => ({ ...l.box })), rawText: observations.map(l => l.text).join(' '),
      ocrConfidence: known.length ? Math.min(...known) : null, parserConfidence: cells.some(l => invalidGrouping.has(l)) ? Math.min(confidence, .2) : cells.some(l => spaceNormalized.has(l)) ? Math.min(confidence, .5) : confidence,
      source: cells.some(l => spaceNormalized.has(l) || invalidGrouping.has(l)) ? 'derived' : source, ...(typeof value === 'number' ? { moneyTokens } : {}), warnings: [...(cells.some(l => spaceNormalized.has(l)) ? ['금액 안의 공백을 천단위로 해석했어요. 원문을 확인해 주세요'] : []), ...(cells.some(l => invalidGrouping.has(l)) ? ['금액의 천단위 구분이 이상해요. 원문을 확인해 주세요'] : [])] };
  };
  const totalCandidates: TotalCandidate[] = [];
  let totalLabelCount = 0;
  let unreadableDefinitiveTotal = false;
  const amounts: ParsedReceipt['amounts'] = { supply: null, vat: null, deposit: null, returns: null, goods: null, shipping: null, discount: null, balance: null };
  const amountCells = new Map<keyof typeof amounts, RecognizedLine[]>();
  const amountStatus = Object.fromEntries(Object.keys(amounts).map(key => [key, 'absent'])) as Record<keyof typeof amounts, 'absent' | 'observed' | 'unreadable'>;
  const amountsWithContent = new Set<keyof typeof amounts>();
  const unparsedAmounts = new Set<keyof typeof amounts>();
  const dates: ReceiptField<string>[] = [];
  const vendors: ReceiptField<string>[] = [];
  const aliases: [string, RegExp][] = [['바른종합식자재', /바른종합식자재/], ['포도주류', /포도주류/], ['신선한 식탁', /신선한식탁/], ['수원축산', /수원축산/], ['쿠팡', /쿠팡/], ['네이버', /네이버/]];
  const semanticLabels: [keyof typeof amounts, RegExp][] = [
    ['balance', /전일잔액|전일채권|미수잔액|이월|누적|누계|잔액/], ['supply', /공급가(?:액)?/], ['vat', /부가세|세액|VAT/i],
    ['deposit', /보증금/], ['returns', /회수|공병반납|용기반납/], ['goods', /상품금액|상품액/], ['shipping', /배송비/], ['discount', /할인|쿠폰/],
  ];
  const summaryValue = (text: string, label: RecognizedLine, valueCells: RecognizedLine[]): number | null => {
    const normalized = normalizeMoney(text).trim()
      .replace(/^(?:총|쿠페이\s*(?:머니)?|[가-힣A-Za-z]+카드\s*\/\s*(?:일시불|일시물))\s*(?=[₩W(+\-\d])/, '')
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
    if (/^[+-]?(?:₩|W)?\s*\d+(?:,\s*\d+)+(?:\s*원)?$/.test(normalized)) {
      const value = Number(normalized.replace(/[₩W,원\s]/g, ''));
      if (Number.isSafeInteger(value)) { invalidGrouping.add(label); return value; }
    }
    return null;
  };
  type ValueReading = { label: string; tokens: MoneyToken[] } & (
    | { state: 'empty' | 'unparsed' }
    | { state: 'parsed'; value: number }
  );
  interface ValueSegment { name: string; start: number; end: number; content: string; reading: ValueReading }
  const classifyValue = (content: string, label: RecognizedLine, valueCells: RecognizedLine[], tokens: MoneyToken[], name: string): ValueReading => {
    if (!content.trim()) return { state: 'empty', label: name, tokens: [] };
    const value = summaryValue(content, label, valueCells);
    return value === null ? { state: 'unparsed', label: name, tokens }
      : { state: 'parsed', value, label: name, tokens };
  };
  // Split every label's own span before resolving aliases. A failed parse must
  // retain its content and cannot be replaced by another label's trailing number.
  const segmentCache = new Map<RecognizedLine, ValueSegment[]>();
  const segmentsFor = (cell: RecognizedLine, fallback: RegExp): ValueSegment[] => {
    const cached = segmentCache.get(cell);
    if (cached) return cached;
    const normalized = normalizedOffsets(cell.text).text;
    const positions = [...normalized.matchAll(/\S/g)].map(match => match.index!);
    const markers = [...compact(normalized).matchAll(summaryLabels)].map(match => ({
      text: match[0], start: positions[match.index!], end: positions[match.index! + match[0].length - 1] + 1,
    }));
    const knownMarkers = markers.length > 0;
    if (!markers.length) {
      const match = compact(normalized).match(fallback);
      if (match) markers.push({ text: match[0], start: positions[match.index!], end: positions[match.index! + match[0].length - 1] + 1 });
    }
    const segments = markers.map((marker, index) => {
      const start = marker.end, end = markers[index + 1]?.start ?? normalized.length;
      const content = normalized.slice(start, end).replace(/^[\s:/|：]+/g, '')
        .replace(index + 1 < markers.length ? /[\s/|]+$/g : /\s+$/g, '');
      return { name: marker.text, start, end, content, reading: classifyValue(content, cell, [cell], tokensFor(cell, start, end), markers.length > 1 ? marker.text : cell.text) };
    });
    // A fallback depends on the requested pattern; known summary markers do not.
    if (knownMarkers) segmentCache.set(cell, segments);
    return segments;
  };
  const readingFor = (row: ReceiptRow, label: RecognizedLine, pattern: RegExp, occurrence = 0): ValueReading => {
    const segments = segmentsFor(label, pattern);
    const index = segments.map((segment, i) => pattern.test(segment.name) ? i : -1).filter(i => i >= 0)[occurrence] ?? -1;
    const own = segments[index];
    if (!own) return { state: 'empty', label: label.text, tokens: [] };
    if (own.reading.state !== 'empty') return own.reading;
    const following = segments.slice(index + 1);
    const last = following[following.length - 1];
    // Only a genuinely empty alias chain may share the single trailing token.
    // Token identity is preserved so R11 still rejects reused arithmetic evidence.
    if (last?.reading.state === 'parsed' && following.slice(0, -1).every(segment => segment.reading.state === 'empty')
      && [...normalizedOffsets(label.text).text.matchAll(numericTokens)].length === 1) {
      return { ...last.reading, label: own.reading.label };
    }
    if (following.some(segment => segment.reading.state !== 'empty')) return own.reading;
    const nextLabel = row.cells.find(cell => cell !== label && cx(cell) > cx(label)
      && (semanticLabels.some(([, regex]) => regex.test(compact(cell.text))) || [...compact(cell.text).matchAll(summaryLabels)].length > 0));
    const right = row.cells.filter(cell => cell !== label && cx(cell) > cx(label) && (!nextLabel || cx(cell) < cx(nextLabel)));
    return classifyValue(right.map(cell => cell.text).join(' '), label, right, right.flatMap(cell => tokensFor(cell)), own.reading.label);
  };
  const valueFor = (row: ReceiptRow, label: RecognizedLine, pattern: RegExp, occurrence = 0) => {
    const reading = readingFor(row, label, pattern, occurrence);
    return reading.state === 'parsed' ? reading : null;
  };
  for (const row of rows) {
    const isTableHeader = row.cells.filter(l => columnNames.includes(compact(l.text))).length >= 2 && !row.cells.some(l => wholeMoney(l.text) !== null);
    for (const cell of row.cells) {
      const text = compact(normalizeMoney(cell.text));
      for (const [key, pattern] of semanticLabels) {
        if (!isTableHeader && pattern.test(text)) {
          const count = Math.max(1, [...text.matchAll(summaryLabels)].filter(match => pattern.test(match[0])).length);
          for (let occurrence = 0; occurrence < count; occurrence++) {
            const reading = readingFor(row, cell, pattern, occurrence);
            const value = reading.state === 'parsed' ? reading.value : null;
            if (reading.state !== 'empty') amountsWithContent.add(key);
            if (reading.state === 'unparsed') unparsedAmounts.add(key);
            if (value === null || (amounts[key] !== null && amounts[key]!.value !== value)) amountStatus[key] = 'unreadable';
            else {
              if (amountStatus[key] !== 'unreadable') amountStatus[key] = 'observed';
              if (amounts[key] === null) { amounts[key] = field(value, row.cells, .7, 'observed', reading!.tokens); amountCells.set(key, row.cells); }
            }
          }
        }
      }
      if (!isTableHeader && !excluded.test(text)) {
        const scoreFor = (label: string) => /금일합계/.test(label) ? 120 : /총결제금액|결제금액|실결제|청구금액/.test(label) ? 110
          : /총합계|합계금액/.test(label) ? 100 : /매출합계|매출총계|^총계(?:[₩W\d(+\-]|$)/.test(label) ? 90
          : /^합계(?:[₩W\d(+\-]|$)/.test(label) ? 65 : /주문금액/.test(label) ? 60 : 0;
        const markers = [...text.matchAll(summaryLabels)].map(match => match[0]).filter(label => scoreFor(label) > 0);
        // Preserve every printed total in a composite observation, including
        // repeated/conflicting labels; splitting must not hide a second total.
        const labels = markers.length ? markers : [text];
        for (const [index, label] of labels.entries()) {
          let score = scoreFor(label);
          if (row.cells.some(other => other !== cell && excluded.test(compact(other.text)))) score = 0;
          if (score) totalLabelCount += 1;
          const pattern = markers.length ? new RegExp(`^${label}$`, 'i') : /금일합계|총계|합계|결제금액|주문금액/;
          const occurrence = labels.slice(0, index).filter(previous => previous === label).length;
          const reading = score ? valueFor(row, cell, pattern, occurrence) : null;
          if (!reading && score && /금일합계|결제|청구|매출합계|매출총계/.test(label)) unreadableDefinitiveTotal = true;
          if (reading) {
            const candidate = { ...field(reading.value, row.cells, score >= 100 ? .85 : .6, 'observed', reading.tokens), label: reading.label, score };
            totalCandidates.push(candidate);
            if (invalidGrouping.has(cell)) invalidTotalCandidates.add(candidate);
          }
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
    return value === null ? null : field(value, [cell], .7, 'observed', tokensFor(cell));
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
    const amount = amountHeader ? findColumn(row, amountHeader) : (fallback ? field(extractMoney(fallback.text)[0], [fallback], .5, 'observed', tokensFor(fallback)) : null);
    const arithmeticMatches = quantity && unitPrice && amount ? Math.round(quantity.value * unitPrice.value) === amount.value : null;
    if (arithmeticMatches === false) amount?.warnings.push('수량 × 단가와 인쇄 금액이 달라요');
    items.push({ name, quantity, unitPrice, amount, arithmeticMatches });
    itemCells.push(...row.cells);
  }
  const itemSum = items.length && items.every(i => i.amount !== null) ? items.reduce((sum, i) => sum + i.amount!.value, 0) : null;
  // A provisional whitespace reading must not corroborate itself through tax
  // or goods equations. Keep the original value, but stop those calculations.
  for (const [key, cells] of amountCells) {
    if (cells.some(l => spaceNormalized.has(l) || invalidGrouping.has(l))) amountStatus[key] = 'unreadable';
  }
  // Collect evidence before selecting anything. Candidate score and column
  // geometry are never a substitute for an independent arithmetic check.
  totalCandidates.sort((a, b) => b.score - a.score);
  const printedTotals = [...totalCandidates];
  const isSalesTotal = (candidate: TotalCandidate) => /매출합계|매출총계/.test(compact(candidate.label));
  const dailyTotals = printedTotals.filter(c => /금일합계/.test(compact(c.label)) && !invalidTotalCandidates.has(c));
  const daily = new Set(dailyTotals.map(c => c.value)).size === 1 ? dailyTotals[0] : undefined;
  // Classify a competing generic total only with an independent printed balance relation.
  const cumulativeTotals = new Set(printedTotals.filter(candidate => daily && amountStatus.balance === 'observed' && amounts.balance
    && /^(?:합계|총합계|합계금액)(?:[₩W(+\-\d]|$)/.test(compact(candidate.label))
    && !invalidTotalCandidates.has(candidate) && candidate.value === daily.value + amounts.balance.value
    && disjoint([daily.moneyTokens ?? [], amounts.balance.moneyTokens ?? [], candidate.moneyTokens ?? []])));
  const currentTotals = printedTotals.filter(candidate => !cumulativeTotals.has(candidate));
  const currentLabelCount = totalLabelCount - cumulativeTotals.size;
  let payableTotals: TotalCandidate[] = [];
  const isFinalPayment = (candidate: TotalCandidate) => /금일합계|결제|청구/.test(compact(candidate.label)) || isSalesTotal(candidate);

  type Equation = {
    value: number;
    operands: MoneyToken[][];
    // Auxiliary agreement is a constraint, not independent arithmetic evidence.
    constraints?: { value: number; expected: number; tokens: MoneyToken[][] }[];
    cells: RecognizedLine[]; label: string; score: number;
  };
  const equations: Equation[] = [];
  const operandsFor = (...keys: (keyof typeof amounts)[]) => keys.filter(key => amountStatus[key] !== 'absent').map(key => amounts[key]?.moneyTokens ?? []);
  const cellsFor = (...keys: (keyof typeof amounts)[]) => keys.flatMap(key => amountCells.get(key) ?? []);
  const supplyPlusVat = amounts.supply && amounts.vat && amountStatus.supply === 'observed' && amountStatus.vat === 'observed'
    ? amounts.supply.value + amounts.vat.value : null;
  const adjustmentsKnown = amountStatus.shipping !== 'unreadable' && amountStatus.discount !== 'unreadable';
  const adjustment = adjustmentsKnown ? (amounts.shipping?.value ?? 0) - Math.abs(amounts.discount?.value ?? 0) : null;
  const goodsAdjustments = amounts.goods && amountStatus.goods === 'observed' && adjustment !== null
    ? amounts.goods.value + adjustment : null;
  const financialKeys = ['supply', 'vat', 'goods', 'shipping', 'discount', 'returns', 'deposit'] as const;
  const blockingUnparsed = financialKeys.some(key => unparsedAmounts.has(key));
  const hasMaterials = items.length > 0 || amountStatus.balance !== 'absent'
    || financialKeys.some(key => amountStatus[key] !== 'absent')
    || printedTotals.some(c => /매출합계|매출총계|주문금액/.test(compact(c.label)));
  let incomplete = financialKeys.some(key => amountStatus[key] === 'unreadable')
    || items.some(item => item.amount === null) || totalLabelCount !== printedTotals.length;
  let totalConflict = items.some(i => i.arithmeticMatches === false);
  let supplyScopeUnknown = false;
  let supplyPayable: number | null = null;
  let supplyOperandKeys: (keyof typeof amounts)[] = ['supply', 'vat', 'shipping', 'discount'];
  const supplyConstraints: NonNullable<Equation['constraints']> = [];
  if (supplyPlusVat !== null && adjustment !== null) {
    if (amountStatus.goods === 'absent' && adjustment === 0) supplyPayable = supplyPlusVat;
    else if (amountStatus.goods === 'observed' && amounts.goods) {
      if (supplyPlusVat === amounts.goods.value) {
        supplyPayable = supplyPlusVat + adjustment;
        supplyConstraints.push({ value: amounts.goods.value, expected: supplyPlusVat, tokens: operandsFor('goods') });
      } else if (supplyPlusVat === goodsAdjustments) {
        supplyPayable = supplyPlusVat;
        supplyOperandKeys = ['supply', 'vat'];
        supplyConstraints.push({ value: goodsAdjustments!, expected: supplyPlusVat, tokens: operandsFor('goods', 'shipping', 'discount') });
      } else totalConflict = true;
    } else supplyScopeUnknown = true;
  } else if (amountStatus.supply !== 'absent' || amountStatus.vat !== 'absent') incomplete = true;
  if (supplyPayable !== null) equations.push({ value: supplyPayable, operands: operandsFor(...supplyOperandKeys), constraints: supplyConstraints, cells: cellsFor(...supplyOperandKeys),
    label: '공급가·부가세와 상품·조정 관계 (합계 라벨 확인)', score: 105 });
  if (goodsAdjustments !== null && amountStatus.returns === 'absent') equations.push({ value: goodsAdjustments, operands: operandsFor('goods', 'shipping', 'discount'),
    cells: cellsFor('goods', 'shipping', 'discount'), label: '상품 + 배송 − 할인 (합계 라벨 확인)', score: 105 });
  const grossRow = rows.find(r => /매출합계|매출총계/.test(compact(r.text)) && !excluded.test(compact(r.text)));
  let gross: number | null = null;
  let grossTokens: MoneyToken[] = [];
  if (grossRow) {
    const label = grossRow.cells.find(l => /매출합계|매출총계/.test(compact(l.text)))!;
    const reading = valueFor(grossRow, label, /매출합계|매출총계/);
    if (!spaceNormalized.has(label) && !invalidGrouping.has(label)) { gross = reading?.value ?? null; grossTokens = reading?.tokens ?? []; }
  }
  if (amountStatus.returns !== 'absent') {
    if (gross !== null && amounts.returns && amountStatus.returns === 'observed') {
      equations.push({ value: gross - Math.abs(amounts.returns.value), operands: [grossTokens, ...operandsFor('returns')], cells: [...grossRow!.cells, ...cellsFor('returns')],
        label: '매출 − 회수 (결제 라벨 확인)', score: 115 });
      // A separate goods amount does not state whether returns are included.
      if (amountStatus.goods !== 'absent') incomplete = true;
    } else incomplete = true;
  }
  if (itemSum !== null && amountHeader && !items.some(i => i.arithmeticMatches === false) && adjustment !== null && amountStatus.returns === 'absent') {
    if (amountStatus.goods === 'observed' && amounts.goods) {
      if (itemSum !== amounts.goods.value) totalConflict = true;
    } else if (amountStatus.supply === 'absent' && amountStatus.vat === 'absent' && compact(amountHeader.text) !== '공급가액') {
      equations.push({ value: itemSum + adjustment, operands: [...items.map(item => item.amount?.moneyTokens ?? []), ...operandsFor('shipping', 'discount')], cells: [...itemCells, ...cellsFor('shipping', 'discount')],
        label: '품목 합계 + 배송 − 할인 (합계 라벨 확인)', score: 105 });
    } else if (supplyPlusVat !== null && itemSum !== amounts.supply?.value && itemSum !== supplyPlusVat) totalConflict = true;
  }
  // Tax proof confirms the labelled sales amount. Empty return/deposit metadata
  // remains advisory only when actually blank; failed/conflicting return readings stay strict.
  const salesTaxProof = supplyPlusVat !== null && supplyPayable === supplyPlusVat
    && (!amountsWithContent.has('returns') || (amountStatus.returns === 'observed' && amounts.returns?.value === 0));
  payableTotals = currentTotals.filter(candidate => !isSalesTotal(candidate) || salesTaxProof);
  const incompleteFor = (candidate: TotalCandidate) => salesTaxProof && isSalesTotal(candidate)
    ? financialKeys.some(key => key !== 'returns' && key !== 'deposit' && amountStatus[key] === 'unreadable')
      || items.some(item => item.amount === null) || unreadableDefinitiveTotal
    : incomplete;
  if (equations.some(e => e.constraints?.some(constraint => constraint.value !== constraint.expected))) totalConflict = true;
  const equationValues = new Set(equations.map(e => e.value));
  if (equationValues.size > 1) totalConflict = true;
  const expected = equationValues.size === 1 ? equations[0].value : null;
  // A generic total may include the separately observed previous balance.
  // A final-payment label still has to match the current payable exactly.
  const balanceOverall = expected !== null && amountStatus.balance === 'observed' && amounts.balance
    ? expected + amounts.balance.value : null;
  const subtotalValues = [amountStatus.goods === 'observed' ? amounts.goods?.value : null, supplyPlusVat, gross];
  const isCumulative = (candidate: TotalCandidate) => candidate.value === balanceOverall && equations.some(equation =>
    disjoint([...equation.operands, amounts.balance?.moneyTokens ?? [], candidate.moneyTokens ?? []]));
  if (expected !== null && payableTotals.some(candidate => candidate.value !== expected
    && (isFinalPayment(candidate) || (!subtotalValues.includes(candidate.value) && !isCumulative(candidate))))) totalConflict = true;
  const multipleTotals = new Set(payableTotals.filter(isFinalPayment).map(c => c.value)).size > 1
    || (expected === null && new Set(payableTotals.map(c => c.value)).size > 1);
  const matchingTotals = expected === null ? [] : payableTotals.filter(c => c.value === expected && !invalidTotalCandidates.has(c));
  const independentMatches = matchingTotals.map(candidate => ({ candidate,
    equations: equations.filter(equation => disjoint([...equation.operands, candidate.moneyTokens ?? []])),
  }));
  const confirmed = independentMatches.find(match => match.equations.length > 0 && !incompleteFor(match.candidate));
  const matching = confirmed?.candidate;
  const independentEquations = confirmed?.equations ?? [];
  const sharedEvidence = equations.some(equation => !disjoint(equation.operands))
    || (matchingTotals.length > 0 && equations.length > 0 && independentMatches.every(match => match.equations.length === 0));
  let selectedTotal: TotalCandidate | null = null;
  let suggestedTotal: TotalCandidate | null = null;
  if (!blockingUnparsed && matching && independentEquations.length > 0 && !sharedEvidence && !incompleteFor(matching) && !supplyScopeUnknown && !totalConflict && !multipleTotals) {
    selectedTotal = matching;
    const equation = [...independentEquations].sort((a, b) => b.score - a.score)[0];
    const derived: TotalCandidate = { ...field(equation.value, equation.cells, .75, 'derived', [...equation.operands.flat(), ...(matching.moneyTokens ?? [])]), label: equation.label, score: equation.score };
    derived.parserConfidence = Math.min(derived.parserConfidence, matching.parserConfidence);
    derived.warnings = [...new Set([...derived.warnings, ...matching.warnings])];
    derived.sourceBoxes.push(...matching.sourceBoxes);
    derived.rawText += ` | ${matching.rawText}`;
    totalCandidates.push(derived);
    if (derived.score > matching.score) selectedTotal = derived;
  } else if (!blockingUnparsed && (!hasMaterials || (daily && payableTotals.length === 1 && payableTotals[0] === daily && equations.length === 0
    && financialKeys.every(key => amountStatus[key] === 'absent') && !totalConflict && !multipleTotals))
    && currentLabelCount === 1 && payableTotals.length === 1 && payableTotals[0].source === 'observed'
    && !/주문금액/.test(compact(payableTotals[0].label))) {
    suggestedTotal = { ...payableTotals[0], parserConfidence: Math.min(payableTotals[0].parserConfidence, .4),
      warnings: [...payableTotals[0].warnings, '영수증 합계를 확인해주세요'] };
  }
  const guidanceCodes: ReceiptGuidanceCode[] = [];
  const wholeOrder = rows.some(row => /배송\d+건중/.test(compact(row.text)));
  if (wholeOrder && (suggestedTotal || selectedTotal)) {
    guidanceCodes.push('WHOLE_ORDER_TOTAL');
    (suggestedTotal ?? selectedTotal)!.warnings.push('주문 전체 결제금액이에요');
  }
  if (invalidGrouping.size) guidanceCodes.push('INVALID_THOUSANDS_GROUPING');
  if (lines.length > 0 && totalLabelCount === 0) guidanceCodes.push('PAYMENT_SCREEN_REQUIRED');
  totalCandidates.sort((a, b) => b.score - a.score);
  const unresolvedReturns = amountStatus.returns !== 'absent' && selectedTotal === null;
  const itemsMatchTotal = itemSum !== null && selectedTotal !== null ? itemSum === selectedTotal.value : null;
  const warnings = ['인식 결과를 원본과 확인해 주세요'];
  if (supplyScopeUnknown) warnings.push('공급가·부가세의 배송·할인 포함 여부를 확인해 주세요');
  if (spaceNormalized.size) warnings.push('공백 숫자의 독립 검산 근거를 확인해 주세요');
  if (suggestedTotal) warnings.push('영수증 합계를 확인해주세요');
  if (guidanceCodes.includes('WHOLE_ORDER_TOTAL')) warnings.push('주문 전체 결제금액이에요');
  if (guidanceCodes.includes('PAYMENT_SCREEN_REQUIRED')) warnings.push('결제 화면을 함께 올려주세요');
  if (invalidGrouping.size) warnings.push('금액의 천단위 구분이 이상해요. 원문을 확인해 주세요');
  if (sharedEvidence) warnings.push('같은 금액 토큰이 공유되어 독립 검산으로 합계를 확정하지 않았어요');
  if (incomplete && !selectedTotal) warnings.push('검산 자료가 불완전해 합계를 확정하지 않았어요');
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
      goodsAdjustments, goodsAdjustmentsMatchTotal: goodsAdjustments !== null && selectedTotal ? goodsAdjustments === selectedTotal.value : null }, guidanceCodes, warnings };
}
