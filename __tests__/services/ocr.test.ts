import { clovaTextToLineItems, callOcrEdgeFunction } from '../../lib/services/ocr';
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

describe('clovaTextToLineItems', () => {
  it('표준 포맷 줄을 파싱한다', () => {
    const text = '소주 10병 1800';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('소주');
    expect(items[0].quantity).toBe(10);
    expect(items[0].unit).toBe('병');
    expect(items[0].unit_price).toBe(1800);
    expect(items[0].confidence).toBe('high');
  });

  it('파싱 실패한 줄은 confidence low로 반환한다', () => {
    const text = '알 수 없는 텍스트!!!';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items).toHaveLength(1);
    expect(items[0].confidence).toBe('low');
    expect(items[0].raw).toBe('알 수 없는 텍스트!!!');
  });

  it('재고에 있는 품목은 matched_ingredient가 설정된다', () => {
    const text = '소주 10병 1800';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items[0].matched_ingredient).not.toBeNull();
    expect(items[0].matched_ingredient!.id).toBe('ing-1');
  });

  it('재고에 없는 품목은 matched_ingredient가 null이다', () => {
    const text = '김치 5kg 3000';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items[0].matched_ingredient).toBeNull();
    expect(items[0].match_candidates).toHaveLength(0);
  });

  it('이전 단가와 다를 때 prev_price가 설정된다', () => {
    const text = '소주 10병 1800';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items[0].prev_price).toBe(1500);
  });

  it('이전 단가가 없으면 prev_price가 null이다', () => {
    const noPrice = mockIngredients.map(i => ({ ...i, last_price: 0 }));
    const text = '소주 10병 1800';
    const items = clovaTextToLineItems(text, noPrice);
    expect(items[0].prev_price).toBeNull();
  });

  it('빈 줄은 무시한다', () => {
    const text = '\n소주 10병 1800\n\n맥주 5캔 2000\n';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items).toHaveLength(2);
  });

  it('단위 없는 줄도 파싱한다 (단위 기본값 "개")', () => {
    const text = '소주 10 1800';
    const items = clovaTextToLineItems(text, mockIngredients);
    expect(items[0].unit).toBe('개');
  });
});

describe('callOcrEdgeFunction', () => {
  const mockInvoke = require('../../lib/supabase').supabase.functions.invoke as jest.Mock;

  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('Edge Function을 호출하고 text를 반환한다', async () => {
    mockInvoke.mockResolvedValue({
      data: { text: '소주 10병 1800' },
      error: null,
    });

    const result = await callOcrEdgeFunction('base64data');
    expect(result).toBe('소주 10병 1800');
    expect(mockInvoke).toHaveBeenCalledWith('ocr', { body: { image_base64: 'base64data' } });
  });

  it('Edge Function 오류 시 예외를 던진다', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: '서버 오류' },
    });

    await expect(callOcrEdgeFunction('base64data')).rejects.toThrow('OCR 서버 오류: 서버 오류');
  });
});
