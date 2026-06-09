import { parseOcrItems, callOcrEdgeFunction } from '../../lib/services/ocr';
import { Ingredient } from '../../types';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

const mockIngredients: Ingredient[] = [
  {
    id: 'ing-1', store_id: 's1', name: '소주', category: '주류',
    current_stock: 10, unit: '병', min_stock: 5, last_price: 1500,
    updated_at: '', created_at: '',
  },
  {
    id: 'ing-2', store_id: 's1', name: '맥주', category: '주류',
    current_stock: 20, unit: '캔', min_stock: 10, last_price: 2000,
    updated_at: '', created_at: '',
  },
];

describe('parseOcrItems', () => {
  it('Gemini JSON 형식을 파싱한다', () => {
    const json = JSON.stringify([
      { name: '소주', quantity: 10, unit: '병', unit_price: 1800 },
    ]);
    const items = parseOcrItems(json, mockIngredients);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('소주');
    expect(items[0].quantity).toBe(10);
    expect(items[0].unit).toBe('병');
    expect(items[0].unit_price).toBe(1800);
    expect(items[0].confidence).toBe('high');
  });

  it('잘못된 JSON이면 빈 배열을 반환한다', () => {
    const text = 'invalid json';
    const items = parseOcrItems(text, mockIngredients);
    expect(items).toHaveLength(0);
  });

  it('배열이 아닌 JSON이면 빈 배열을 반환한다', () => {
    const text = JSON.stringify({ items: [] });
    const items = parseOcrItems(text, mockIngredients);
    expect(items).toHaveLength(0);
  });

  it('재고에 있는 품목은 matched_ingredient가 설정된다', () => {
    const json = JSON.stringify([
      { name: '소주', quantity: 10, unit: '병', unit_price: 1800 },
    ]);
    const items = parseOcrItems(json, mockIngredients);
    expect(items[0].matched_ingredient).not.toBeNull();
    expect(items[0].matched_ingredient!.id).toBe('ing-1');
  });

  it('재고에 없는 품목은 matched_ingredient가 null이다', () => {
    const json = JSON.stringify([
      { name: '김치', quantity: 5, unit: 'kg', unit_price: 3000 },
    ]);
    const items = parseOcrItems(json, mockIngredients);
    expect(items[0].matched_ingredient).toBeNull();
    expect(items[0].match_candidates).toHaveLength(0);
  });

  it('이전 단가와 다를 때 prev_price가 설정된다', () => {
    const json = JSON.stringify([
      { name: '소주', quantity: 10, unit: '병', unit_price: 1800 },
    ]);
    const items = parseOcrItems(json, mockIngredients);
    expect(items[0].prev_price).toBe(1500);
  });

  it('이전 단가가 없으면 prev_price가 null이다', () => {
    const noPrice = mockIngredients.map(i => ({ ...i, last_price: 0 }));
    const json = JSON.stringify([
      { name: '소주', quantity: 10, unit: '병', unit_price: 1800 },
    ]);
    const items = parseOcrItems(json, noPrice);
    expect(items[0].prev_price).toBeNull();
  });

  it('quantity가 0 이하면 confidence는 low이다', () => {
    const json = JSON.stringify([
      { name: '소주', quantity: 0, unit: '병', unit_price: 1800 },
    ]);
    const items = parseOcrItems(json, mockIngredients);
    expect(items[0].confidence).toBe('low');
  });

  it('name이 빈 문자열이면 confidence는 low이다', () => {
    const json = JSON.stringify([
      { name: '', quantity: 10, unit: '병', unit_price: 1800 },
    ]);
    const items = parseOcrItems(json, mockIngredients);
    expect(items[0].confidence).toBe('low');
  });

  it('여러 항목을 한 번에 파싱한다', () => {
    const json = JSON.stringify([
      { name: '소주', quantity: 10, unit: '병', unit_price: 1800 },
      { name: '맥주', quantity: 5, unit: '캔', unit_price: 2000 },
    ]);
    const items = parseOcrItems(json, mockIngredients);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('소주');
    expect(items[1].name).toBe('맥주');
  });
});

describe('callOcrEdgeFunction', () => {
  const mockInvoke = require('../../lib/supabase').supabase.functions.invoke as jest.Mock;

  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('Edge Function을 호출하고 JSON 배열 문자열을 반환한다', async () => {
    mockInvoke.mockResolvedValue({
      data: { items: [{ name: '소주', quantity: 10, unit: '병', unit_price: 1800 }] },
      error: null,
    });

    const result = await callOcrEdgeFunction('base64data');
    expect(result).toBe(JSON.stringify([{ name: '소주', quantity: 10, unit: '병', unit_price: 1800 }]));
    expect(mockInvoke).toHaveBeenCalledWith('ocr', { body: { image_base64: 'base64data' } });
  });

  it('반환값을 JSON.parse로 파싱할 수 있다', async () => {
    mockInvoke.mockResolvedValue({
      data: { items: [{ name: '소주', quantity: 10, unit: '병', unit_price: 1800 }] },
      error: null,
    });

    const result = await callOcrEdgeFunction('base64data');
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe('소주');
  });

  it('Edge Function 오류 시 예외를 던진다', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: '서버 오류' },
    });

    await expect(callOcrEdgeFunction('base64data')).rejects.toThrow('OCR 서버 오류: 서버 오류');
  });

  it('items 필드가 없으면 예외를 던진다', async () => {
    mockInvoke.mockResolvedValue({
      data: { text: '소주 10병 1800' },
      error: null,
    });

    await expect(callOcrEdgeFunction('base64data')).rejects.toThrow('OCR 응답에 items가 없습니다');
  });
});
