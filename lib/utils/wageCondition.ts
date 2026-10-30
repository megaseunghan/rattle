/** Date fields must describe a real explicitly selected calendar date. */
export function isWageDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function wageAmount(value: string): number | null {
  if (!/^\d[\d,]*$/.test(value.trim())) return null;
  const amount = Number(value.replace(/,/g, ''));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
