/* design-system: DESIGN.md — shared vector assets, retaining legacy names during migration. */
import { memo, type ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml, type SvgProps } from 'react-native-svg';
import { vectorAssets, type VectorAssetName } from './vectorAssets';

type LegacyName = keyof typeof Ionicons.glyphMap;
export const legacyIconAssets: Partial<Record<LegacyName, VectorAssetName>> = {
  menu: 'menu', 'menu-outline': 'menu', 'notifications-outline': 'notification',
  person: 'profile', 'person-outline': 'profile', 'person-circle-outline': 'profile',
  'grid-outline': 'dashboard', grid: 'dashboard', home: 'home', 'home-outline': 'home',
  cube: 'inventory', 'cube-outline': 'inventory', cart: 'purchase', 'cart-outline': 'purchase',
  people: 'staff', 'people-outline': 'staff', 'stats-chart': 'sales', 'stats-chart-outline': 'sales',
  'bar-chart-outline': 'sales', storefront: 'store', 'storefront-outline': 'store', 'business-outline': 'store',
  'chevron-back': 'chevron-left', 'chevron-forward': 'chevron-right', 'arrow-forward': 'chevron-right',
  'chevron-up': 'chevron-up', 'chevron-down': 'chevron-down', close: 'close',
  'close-circle': 'close', 'close-circle-outline': 'close', add: 'add', 'add-circle-outline': 'add',
  'create-outline': 'edit', pencil: 'edit', 'pencil-outline': 'edit', 'trash-outline': 'delete',
  'search-outline': 'search', 'filter-outline': 'filter', 'options-outline': 'filter',
  'reorder-three-outline': 'reorder', checkmark: 'check', 'checkbox-outline': 'checkbox',
  'square-outline': 'checkbox', 'radio-button-off': 'radio', 'radio-button-on': 'radio-checked',
  'calendar-outline': 'calendar', 'time-outline': 'time', 'refresh-outline': 'refresh',
  'sync-outline': 'sync', 'repeat-outline': 'sync', 'copy-outline': 'copy',
  'eye-outline': 'visibility', 'lock-closed': 'lock', 'lock-closed-outline': 'lock',
  'log-out-outline': 'logout', 'settings-outline': 'settings',
  'information-circle-outline': 'info', 'alert-circle-outline': 'error', 'warning-outline': 'warning',
  'checkmark-circle': 'success', 'checkmark-circle-outline': 'success', 'checkmark-done-outline': 'checklist',
  'document-text-outline': 'document', 'shield-checkmark-outline': 'shield',
  'person-remove-outline': 'member-remove', 'pricetag-outline': 'category', 'folder-open-outline': 'folder',
  'card-outline': 'card', 'cash-outline': 'cash', 'calculator-outline': 'calculator',
  'megaphone-outline': 'marketing', 'construct-outline': 'maintenance', 'flash-outline': 'utilities',
  'restaurant-outline': 'recipe', 'receipt-outline': 'expense', 'analytics-outline': 'profit-loss',
  'sunny-outline': 'open-prep', 'moon-outline': 'closing', 'desktop-outline': 'pos',
};

type Props = Omit<ComponentProps<typeof Ionicons>, 'name'> & { name: LegacyName | VectorAssetName };
const Icon = memo(function AppIcon({ name, size = 24, color = '#191F28', style, ...props }: Props) {
  const asset = Object.prototype.hasOwnProperty.call(vectorAssets, name)
    ? name as VectorAssetName : legacyIconAssets[name as LegacyName];
  if (!asset) return <Ionicons name={name as LegacyName} size={size} color={color} style={style} {...props} />;
  return <SvgXml xml={vectorAssets[asset]} width={size} height={size} color={color}
    {...props} style={style as SvgProps['style']} />;
});
// Existing data definitions can keep their legacy name union; unsupported symbols use the library.
export const AppIcon = Object.assign(Icon, { glyphMap: Ionicons.glyphMap });
