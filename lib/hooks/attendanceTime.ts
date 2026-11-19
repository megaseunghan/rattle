/** Pure KST formatting; safe for the anonymous scanner without loading app authentication. */
export const attendanceTime = (value?: string | null) => value
  ? new Date(value).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
