const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** "11월 21일 오후 3시" style deadline in Korean time, independent of device time zone. */
export function formatRestoreDeadline(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '7일 뒤';
  const kst = new Date(time + KST_OFFSET_MS);
  const hour = kst.getUTCHours();
  const period = hour < 12 ? '오전' : '오후';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${period} ${hour12}시`;
}
