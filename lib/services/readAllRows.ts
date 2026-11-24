/** 한 번에 요청하는 행 수. PostgREST max rows(개발 DB 1000, 2026-11-24 확인)가 이 값 이상이어야 짧은 페이지를 마지막으로 볼 수 있다. */
export const READ_ALL_ROWS_PAGE_SIZE = 500;

/**
 * 받은 행이 페이지 크기보다 적으면 마지막 페이지로 보고 끝낸다. 호출자는 유일 키 순서를 지정한다.
 * 운영 DB를 분리하면 그 프로젝트의 max rows도 500 이상인지 확인해야 한다(작으면 행이 잘린다).
 */
export async function readAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + READ_ALL_ROWS_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data) throw new Error('Financial source returned no data');
    rows.push(...data);
    if (data.length < READ_ALL_ROWS_PAGE_SIZE) return rows;
  }
}
