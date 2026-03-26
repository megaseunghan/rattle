import { Ingredient, OcrLineItem } from '../../types';
import { supabase } from '../supabase';

const LINE_PATTERN = /^(.+?)\s+(\d+(?:\.\d+)?)\s*(개|병|캔|팩|봉|박스|kg|g|L|ml|장|묶음)?\s+(\d[\d,]*)$/;

export function clovaTextToLineItems(
  text: string,
  ingredients: Ingredient[]
): OcrLineItem[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  return lines.map((raw): OcrLineItem => {
    const match = raw.match(LINE_PATTERN);

    if (!match) {
      return {
        raw,
        name: raw,
        quantity: 1,
        unit: '개',
        unit_price: 0,
        confidence: 'low',
        matched_ingredient: null,
        match_candidates: [],
        prev_price: null,
      };
    }

    const name = match[1].trim();
    const quantity = parseFloat(match[2]);
    const unit = match[3] ?? '개';
    const unit_price = parseInt(match[4].replace(/,/g, ''), 10);

    const candidates = ingredients.filter(
      ing => ing.name.includes(name) || name.includes(ing.name)
    );
    const matched = candidates.length === 1 ? candidates[0] : null;

    const matchedForPrice = matched ?? candidates[0] ?? null;
    const prev_price =
      matchedForPrice && matchedForPrice.last_price > 0
        ? matchedForPrice.last_price
        : null;

    return {
      raw,
      name,
      quantity,
      unit,
      unit_price,
      confidence: 'high',
      matched_ingredient: matched,
      match_candidates: candidates.length > 1 ? candidates : [],
      prev_price,
    };
  });
}

export async function callOcrEdgeFunction(imageBase64: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ocr', {
    body: { image_base64: imageBase64 },
  });

  if (error) throw new Error(`OCR 서버 오류: ${error.message}`);
  if (typeof data?.text !== 'string') throw new Error('OCR 응답에 텍스트가 없습니다');
  return data.text;
}
