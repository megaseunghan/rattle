export interface RecurringFixedExpenseVersion {
  effective_month: string;
  name: string;
  amount: number;
  payment_day: number;
  active: boolean;
  end_month: string | null;
}

export interface RecurringFixedExpenseRule {
  id: string;
  source_expense_id: string | null;
  latest_revision: number;
  latest: RecurringFixedExpenseVersion;
  current: RecurringFixedExpenseVersion | null;
}

export interface RecurringFixedExpenseOccurrence {
  id: string; // recurring:{rule_id}:{year_month}, never a manual expense ID
  rule_id: string;
  year_month: string;
  name: string;
  amount: number;
  payment_day: number;
  occurred_on: string;
  status: 'due' | 'scheduled'; // date reached / scheduled; neither confirms payment
}

export interface RecurringFixedExpenseMonth {
  rules: RecurringFixedExpenseRule[];
  occurrences: RecurringFixedExpenseOccurrence[];
  adoptedSourceIds: string[];
}

export interface SaveRecurringFixedExpense {
  rule_id: string;
  store_id: string;
  effective_month: string;
  name: string;
  amount: number;
  payment_day: number;
  active: boolean;
  end_month: string | null;
  source_expense_id: string | null;
  expected_revision: number | null;
}

export interface EffectiveExpenseRow {
  id: string;
  category: '고정비' | '마케팅' | '시설보수' | '공과금';
  name: string;
  amount: number;
  occurred_on: string | null;
  original_year_month: string;
  origin: 'manual' | 'carry' | 'recurring';
  recurring_rule_id: string | null;
  schedule_status: 'due' | 'scheduled' | 'unknown' | 'dated';
}
