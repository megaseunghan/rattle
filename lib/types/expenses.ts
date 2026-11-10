import type { Expense } from '../../types';

// Shared types/index.ts is owned by 00. Merge this field there during integration.
export type DatedExpense = Expense & { occurred_on: string | null };
