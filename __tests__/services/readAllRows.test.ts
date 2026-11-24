import { readAllRows, READ_ALL_ROWS_PAGE_SIZE } from '../../lib/services/readAllRows';

function pagedSource(length: number) {
  const source = Array.from({ length }, (_, id) => ({ id }));
  const page = jest.fn(async (start: number, end: number) => ({ data: source.slice(start, end + 1), error: null }));
  return { source, page };
}

it('페이지 크기는 500행이다', () => {
  expect(READ_ALL_ROWS_PAGE_SIZE).toBe(500);
});

it('0행이면 첫 요청 한 번으로 끝낸다', async () => {
  const { page } = pagedSource(0);
  expect(await readAllRows(page)).toEqual([]);
  expect(page.mock.calls).toEqual([[0, 499]]);
});

it('499행을 받으면 빈 페이지를 다시 읽지 않는다', async () => {
  const { source, page } = pagedSource(499);
  expect(await readAllRows(page)).toEqual(source);
  expect(page.mock.calls).toEqual([[0, 499]]);
});

it('정확히 500행을 받으면 다음 페이지를 읽는다', async () => {
  const { source, page } = pagedSource(500);
  expect(await readAllRows(page)).toEqual(source);
  expect(page.mock.calls).toEqual([[0, 499], [500, 999]]);
});

it('여러 페이지에 걸친 행을 마지막 짧은 페이지에서 끝낸다', async () => {
  const { source, page } = pagedSource(1203);
  expect(await readAllRows(page)).toEqual(source);
  expect(page.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
});

it('중간 페이지 오류를 부분 합계로 반환하지 않는다', async () => {
  const full = Array.from({ length: 500 }, (_, id) => id);
  let call = 0;
  await expect(readAllRows(async () => (++call === 1 ? { data: full, error: null } : { data: null, error: new Error('failed') }))).rejects.toThrow('failed');
});

it('data가 null이면 빈 결과로 바꾸지 않는다', async () => {
  await expect(readAllRows(async () => ({ data: null, error: null }))).rejects.toThrow();
});
