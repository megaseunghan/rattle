/** 미확인 월·매장을 0원으로 바꾸지 않고 합계도 미확인으로 유지한다. */
export function sumKnown(values: readonly (number | null)[]): number | null {
  return values.some(value => value == null) ? null : values.reduce<number>((sum, value) => sum + value!, 0);
}
