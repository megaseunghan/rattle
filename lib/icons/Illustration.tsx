/* design-system: DESIGN.md — decorative artwork; labels and actions stay in native UI. */
import { Image, type ImageStyle, type StyleProp } from 'react-native';
export const illustrationAssets = {
  'open-prep': require('../../assets/icons/runtime/business/open-prep.png'),
  'business-hours': require('../../assets/icons/runtime/business/business-hours.png'),
  'closing': require('../../assets/icons/runtime/business/closing.png'),
  'inventory': require('../../assets/icons/runtime/business/inventory.png'),
  'purchase': require('../../assets/icons/runtime/business/purchase.png'),
  'recipe': require('../../assets/icons/runtime/business/recipe.png'),
  'sales': require('../../assets/icons/runtime/business/sales.png'),
  'expense': require('../../assets/icons/runtime/business/expense.png'),
  'staff': require('../../assets/icons/runtime/business/staff.png'),
  'payroll': require('../../assets/icons/runtime/business/payroll.png'),
  'schedule': require('../../assets/icons/runtime/business/schedule.png'),
  'profit-loss': require('../../assets/icons/runtime/business/profit-loss.png'),
  'checklist': require('../../assets/icons/runtime/business/checklist.png'),
  'work-time': require('../../assets/icons/runtime/business/work-time.png'),
  'store': require('../../assets/icons/runtime/business/store.png'),
  'pos-connect': require('../../assets/icons/runtime/business/pos-connect.png'),
  'empty-data': require('../../assets/icons/runtime/status/empty-data.png'),
  'empty-search': require('../../assets/icons/runtime/status/empty-search.png'),
  'completed': require('../../assets/icons/runtime/status/completed.png'),
  'review-pending': require('../../assets/icons/runtime/status/review-pending.png'),
  'connection-pending': require('../../assets/icons/runtime/status/connection-pending.png'),
  'stock-low': require('../../assets/icons/runtime/status/stock-low.png'),
  'load-error': require('../../assets/icons/runtime/status/load-error.png'),
  'access-denied': require('../../assets/icons/runtime/status/access-denied.png'),
} as const;
export type IllustrationName = keyof typeof illustrationAssets;
export function Illustration({ name, size = 64, style }: { name: IllustrationName; size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={illustrationAssets[name]} resizeMode="contain" style={[{ width: size, height: size }, style]}
    accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" fadeDuration={0} />;
}
