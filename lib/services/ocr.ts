import { Ingredient, OcrLineItem } from '../../types';
import { supabase } from '../supabase';

interface GeminiOcrItem {
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

export function parseOcrItems(
  ocrText: string,
  ingredients: Ingredient[]
): OcrLineItem[] {
  let rawItems: GeminiOcrItem[] = [];
  try {
    rawItems = JSON.parse(ocrText);
  } catch {
    return [];
  }

  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((raw): OcrLineItem => {
    const name = raw.name ?? '';
    const quantity = typeof raw.quantity === 'number' ? raw.quantity : 1;
    const unit = raw.unit ?? '개';
    const unit_price = typeof raw.unit_price === 'number' ? raw.unit_price : 0;

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
      raw: JSON.stringify(raw),
      name,
      quantity,
      unit,
      unit_price,
      confidence: name && quantity > 0 ? 'high' : 'low',
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
  if (!Array.isArray(data?.items)) throw new Error('OCR 응답에 items가 없습니다');

  // JSON 문자열로 반환 — 라우트 파라미터(ocrText)로 전달하기 위함
  return JSON.stringify(data.items);
}
