/** 서버 응답 상한보다 적게 반환되어도 빈 페이지까지 읽는다. 호출자는 유일 키 순서를 지정한다. */
export async function readAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + 499);
    if (error) throw error;
    if (!data) throw new Error('Financial source returned no data');
    if (data.length === 0) return rows;
    rows.push(...data);
  }
}
