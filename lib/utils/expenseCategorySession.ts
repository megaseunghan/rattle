// UI preferences only. Never persist expense amounts or authentication data.
let userId: string | null = null;
const scopes = new Map<string, Readonly<Record<string, boolean>>>();
const empty: Readonly<Record<string, boolean>> = Object.freeze({});
const listeners = new Set<() => void>();

export function setExpenseCategorySession(nextUserId: string | null) {
  if (userId === nextUserId) return;
  userId = nextUserId;
  scopes.clear();
  listeners.forEach(listener => listener());
}

export function subscribeExpenseCategories(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getExpenseCategories(accountId?: string, storeId?: string) {
  return accountId && storeId && accountId === userId ? scopes.get(storeId) ?? empty : empty;
}

export function toggleExpenseCategory(accountId: string | undefined, storeId: string | undefined, category: string) {
  if (!accountId || !storeId || accountId !== userId) return;
  const previous = getExpenseCategories(accountId, storeId);
  scopes.set(storeId, { ...previous, [category]: !previous[category] });
  listeners.forEach(listener => listener());
}
