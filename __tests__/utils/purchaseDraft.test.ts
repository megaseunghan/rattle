import { validatePurchaseDraft, type DraftInput } from '../../lib/utils/purchaseDraft';

const base: DraftInput = {
  supplier: '한빛식자재', mode: 'items', total: 0, type: '수기', category: '식자재', categories: ['식자재', '소모품'], taxonomyReady: true,
  rows: [{ id: 'a', name: '', inputName: '삼겹살', amount: '120000', quantity: '5', unit: 'kg' }],
  amountRows: [{ category: '식자재', value: '' }, { category: '소모품', value: '' }],
};

test('품목별은 이름·금액·수량을 서버 형식으로 바꾼다', () => {
  const result = validatePurchaseDraft(base);
  expect(result).toEqual({ ok: true, payload: { mode: 'items', rows: [{ ingredient_id: null, name: '삼겹살', quantity: 5, category: '식자재', unit: 'kg', amount: 120000 }] } });
});

test('수량을 비우면 1로 저장하고 금액은 그대로 둔다', () => {
  const result = validatePurchaseDraft({ ...base, rows: [{ id: 'a', name: '', inputName: '양파', amount: '18000', quantity: '' }] });
  expect(result.ok && result.payload.rows[0]).toMatchObject({ quantity: 1, amount: 18000, unit: '' });
});

test('거래처가 없으면 거래처 칸 아래 오류를 돌려준다', () => {
  const result = validatePurchaseDraft({ ...base, supplier: '  ' });
  expect(result).toEqual({ ok: false, errors: { supplier: '거래처를 골라 주세요.', rows: {} } });
});

test('품목마다 무엇이 빠졌는지 그 행에 알려준다', () => {
  const result = validatePurchaseDraft({ ...base, rows: [
    { id: 'a', name: '', amount: '1000', quantity: '' },
    { id: 'b', name: '', inputName: '양파', amount: '', quantity: '' },
    { id: 'c', name: '', inputName: '두부', amount: '1000', quantity: '0' },
  ] });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.rows).toEqual({ a: '품목 이름을 입력해 주세요.', b: '금액을 입력해 주세요.', c: '수량을 확인해 주세요.' });
});

test('분류를 못 불러왔으면 저장하지 않는다', () => {
  const result = validatePurchaseDraft({ ...base, taxonomyReady: false });
  expect(!result.ok && result.errors.form).toBe('매입 카테고리와 유형을 다시 불러와 주세요.');
});

test('금액별은 금액을 넣은 카테고리만 보낸다', () => {
  const result = validatePurchaseDraft({ ...base, mode: 'amounts', amountRows: [{ category: '식자재', value: '40000' }, { category: '소모품', value: '' }] });
  expect(result).toEqual({ ok: true, payload: { mode: 'amounts', rows: [{ category: '식자재', amount: 40000 }] } });
});

test('금액별에서 아무 금액도 없으면 입력 카드에 알려준다', () => {
  const result = validatePurchaseDraft({ ...base, mode: 'amounts' });
  expect(!result.ok && result.errors.form).toBe('카테고리에 금액을 입력해 주세요.');
});

test('합계가 너무 크면 저장하지 않는다', () => {
  const result = validatePurchaseDraft({ ...base, total: 1e12 });
  expect(!result.ok && result.errors.form).toBe('매입 합계를 확인해 주세요.');
});
