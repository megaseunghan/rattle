import { fireEvent, render } from '@testing-library/react-native';
import PosDateScreen from '../../app/pos/[date]';
const mockItems = [
  { itemId: '국밥', itemName: '국밥', categoryName: '식사', quantity: 1, totalAmount: 100 },
  { itemId: '', itemName: '국밥', categoryName: '음료', quantity: 1, totalAmount: 10 },
];
const mockCategories = ['전체', '식사', '음료'];
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ date: '2026-10-01' }), useFocusEffect: () => {}, router: { back: jest.fn() } }));
jest.mock('../../lib/hooks/usePosAnalytics', () => ({ usePosAnalytics: () => {
  const [activeCategory, setActiveCategory] = require('react').useState('전체');
  return { allItems: mockItems, items: activeCategory === '전체' ? mockItems : mockItems.filter(item => item.categoryName === activeCategory),
    categories: mockCategories, activeCategory, setActiveCategory, loadingItems: false, error: null, fetchItems: jest.fn() };
} }));
it('분류 data 참조가 같아도 선택 변경을 반영하고 동명 상품을 구분한다', () => {
  const view = render(<PosDateScreen />);
  expect(view.getAllByText('국밥')).toHaveLength(2);
  fireEvent.press(view.getAllByText('음료')[0]);
  expect(view.getAllByText('국밥')).toHaveLength(1);
  expect(view.getByText('10원')).toBeTruthy();
  fireEvent.press(view.getByText('전체'));
  expect(view.getAllByText('국밥')).toHaveLength(2);
});
