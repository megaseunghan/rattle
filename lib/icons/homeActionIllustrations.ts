import type { HomeActionId } from '../../types';
import type { IllustrationName } from './Illustration';

export const homeActionIllustrations: Record<HomeActionId, IllustrationName> = {
  open_check: 'open-prep', close_check: 'closing', weekday_check: 'checklist',
  stock: 'inventory', stock_edit: 'inventory', schedule: 'schedule',
  purchase: 'purchase', recipes: 'recipe', sales: 'sales', expenses: 'expense',
};
