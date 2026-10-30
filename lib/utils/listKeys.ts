import type { DailyItem } from '../../types';

export const entityKey = (item: { id: string }): string => item.id;
export const stringKey = (value: string): string => value;

// Match get_pos_daily_items identity; distinguish missing IDs from ID/name collisions.
export const dailyItemKey = (item: DailyItem): string =>
  JSON.stringify(item.itemId ? ['id', item.itemId] : ['name', item.itemName]);
