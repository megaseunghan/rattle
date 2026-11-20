import { getPurchasesWithItemCountsByMonth } from '../../lib/services/purchases';
const mockSelect = jest.fn();
const pages: unknown[][] = [];
jest.mock('../../lib/supabase', () => ({ supabase: { from: () => {
  const chain: Record<string, unknown> = {};
  chain.select = (columns: string) => { mockSelect(columns); return chain; };
  for (const name of ['eq', 'gte', 'lte', 'order']) chain[name] = () => chain;
  chain.range = () => Promise.resolve({ data: pages.shift() ?? [], error: null });
  return chain;
} } }));
beforeEach(() => { mockSelect.mockReset(); pages.length = 0; });
it('매입 목록과 품목 수를 한 번의 조회로 받고 중첩 응답은 숫자로 바꾼다', async () => {
  pages.push([
    { id: 'a', amount: 1000, purchase_items: [{ count: 3 }] },
    { id: 'b', amount: 500, purchase_items: [{ count: 0 }] },
    { id: 'c', amount: 200, purchase_items: [] },
  ]);
  const rows = await getPurchasesWithItemCountsByMonth('store', '2026-11');
  expect(mockSelect).toHaveBeenCalledWith('*,category_amounts,purchase_items(count)');
  expect(rows).toEqual([
    { id: 'a', amount: 1000, item_count: 3 },
    { id: 'b', amount: 500, item_count: 0 },
    { id: 'c', amount: 200, item_count: 0 },
  ]);
});
