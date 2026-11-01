import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import StockDetail from '../../app/stock/[id]';
import StockNew from '../../app/stock/new';
import RecipeDetail from '../../app/recipes/[id]';
import RecipeNew from '../../app/recipes/new';
import Recipes from '../../app/recipes';
import { StockScreen } from '../../app/(tabs)/stock';

let mockManage = false;
let mockAdmin = false;
let mockReady = true;
let mockParams: { id?: string } = { id: 'i' };
let mockItemStore = 's';
let mockRecipesPopulated = false;
const mockUpdate = jest.fn(), mockCreate = jest.fn(), mockRemove = jest.fn(), mockPush = jest.fn();
const mockRefetch = jest.fn();
const mockIngredient = () => ({ id: 'i', store_id: mockItemStore, name: '우유', category: '유제품', unit: 'mL', current_stock: 10, min_stock: 2, last_price: 3 });
const mockRecipe = () => ({ id: 'r', store_id: mockItemStore, name: '라떼', category: '음료', selling_price: 5000, cost: 0, margin_rate: 100, recipe_ingredients: [] });
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: (...args: unknown[]) => mockPush(...args) }, useLocalSearchParams: () => mockParams, useFocusEffect: (callback: () => unknown) => {
  const React = require('react'); React.useEffect(callback, [callback]);
} }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' }, store: { id: 's' }, currentRole: mockAdmin ? 'admin' : 'member' }) }));
jest.mock('../../lib/hooks/useStorePermissions', () => ({ useStorePermissions: () => ({ canReadRecipes: true, canManageRecipes: mockManage, canManageStock: mockManage, canAdjustStock: mockReady, isPartTime: !mockManage, isAdmin: mockAdmin, permissionsReady: mockReady }) }));
jest.mock('../../lib/hooks/useIngredients', () => ({ useIngredients: () => ({ data: [], loading: false, hasMore: false, refetch: mockRefetch, update: mockUpdate, create: mockCreate }) }));
jest.mock('../../lib/hooks/useRecipes', () => ({ useRecipes: () => ({ data: mockRecipesPopulated ? [mockRecipe()] : [], loading: false, hasMore: false, refetch: mockRefetch, remove: mockRemove, create: mockCreate, bulkUpdateCategory: jest.fn() }) }));
jest.mock('../../lib/hooks/useCategories', () => ({ useCategories: () => ({ categories: ['유제품'], refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/useTossSync', () => ({ useTossSync: () => ({ syncCatalog: jest.fn() }) }));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: () => jest.fn() }));
jest.mock('../../lib/services/ingredients', () => ({ getIngredientById: jest.fn(async () => mockIngredient()), updateIngredient: jest.fn() }));
jest.mock('../../lib/services/recipes', () => ({ getRecipeById: jest.fn(async () => mockRecipe()), deleteRecipe: (...args: unknown[]) => mockRemove(...args), getRecipesByCategory: jest.fn(async () => []), upsertRecipesFromCatalog: jest.fn(), updateRecipeFull: jest.fn() }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/components/GlassBackdrop', () => ({ GlassBackdrop: () => null }));
jest.mock('../../lib/components/CategoryManageModal', () => ({ CategoryManageModal: () => null }));
jest.mock('../../lib/components/CatalogImportModal', () => ({ CatalogImportModal: () => null }));
jest.mock('../../lib/components/BulkCategoryModal', () => ({ BulkCategoryModal: () => null }));
jest.mock('../../lib/components/ui/SheetModal', () => ({ SheetModal: ({ visible, children }: any) => visible ? children : null }));
beforeEach(() => { jest.clearAllMocks(); mockManage = false; mockAdmin = false; mockReady = true; mockParams = { id: 'i' }; mockItemStore = 's'; mockRecipesPopulated = false; mockUpdate.mockResolvedValue(undefined); });
it('PT 재고 상세는 수량만 편집하고 저장 payload도 한 필드뿐이다', async () => {
  render(<StockDetail />);
  await waitFor(() => expect(screen.getByLabelText('현재 재고 수량')).toBeTruthy());
  for (const label of ['식자재명', '품절 임박 기준', '식자재 단가']) expect(screen.getByLabelText(label).props.editable).toBe(false);
  expect(screen.getByRole('radio', { name: 'kg' })).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText('현재 재고 수량'), '25');
  fireEvent.press(screen.getByText('저장'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('i', { current_stock: 25 }));
  expect(mockUpdate).toHaveBeenCalledTimes(1);
});
it('확인된 관리자는 기존 재고 전체 필드 저장을 유지한다', async () => {
  mockManage = true; mockAdmin = true;
  render(<StockDetail />);
  await waitFor(() => expect(screen.getByLabelText('식자재명')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('식자재명'), '새 우유');
  fireEvent.press(screen.getByText('저장'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('i', expect.objectContaining({ name: '새 우유', category: '유제품', unit: 'mL', min_stock: 2, last_price: 3 })));
});
it('타매장 품목은 편집 폼과 저장을 열지 않는다', async () => {
  mockItemStore = 'other'; render(<StockDetail />);
  await waitFor(() => expect(screen.getByText('현재 매장의 식자재가 아니에요.')).toBeTruthy());
  expect(screen.queryByText('저장')).toBeNull(); expect(mockUpdate).not.toHaveBeenCalled();
});
it('PT의 직접 재고 신규 경로를 차단한다', () => {
  render(<StockNew />);
  expect(screen.getByText('식자재 등록 권한이 없어요.')).toBeTruthy();
  expect(screen.queryByPlaceholderText('예) 원두, 우유, 설탕')).toBeNull(); expect(mockCreate).not.toHaveBeenCalled();
});
it.each([undefined, 'r'])('PT 직접 레시피 신규/수정 경로를 차단한다: %s', id => {
  mockParams = { id }; render(<RecipeNew />);
  expect(screen.getByText('레시피는 조회만 할 수 있어요. 등록·수정은 관리자나 담당 직원에게 요청해 주세요.')).toBeTruthy();
  expect(screen.queryByText('재료 추가')).toBeNull(); expect(mockCreate).not.toHaveBeenCalled();
});
it('PT는 레시피 상세를 읽지만 수정·삭제 행동은 없다', async () => {
  mockParams = { id: 'r' }; render(<RecipeDetail />);
  await waitFor(() => expect(screen.getByText('라떼')).toBeTruthy());
  expect(screen.queryByText('수정')).toBeNull(); expect(screen.queryByText('레시피 삭제')).toBeNull();
});
it('PT 독립 목록은 POS 동기화·분류관리·등록을 제공하지 않는다', () => {
  render(<Recipes />);
  expect(screen.queryByLabelText('POS 메뉴 동기화')).toBeNull();
  expect(screen.queryByLabelText('레시피 카테고리 관리')).toBeNull(); expect(screen.queryByText('레시피 등록')).toBeNull();
});
it('PT 재고 탭에서 레시피 세그먼트를 열 수 있고 빈 화면의 등록 CTA는 없다', () => {
  render(<StockScreen />);
  expect(screen.queryByText('재고 등록')).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: '레시피' }));
  expect(screen.getByText('등록된 레시피가 없어요')).toBeTruthy();
  expect(screen.queryByText('레시피 등록')).toBeNull(); expect(screen.queryByLabelText('레시피 추가')).toBeNull();
});

it('PT의 실제 레시피 목록 카드도 삭제와 분류 관리 행동을 숨긴다', async () => {
  mockRecipesPopulated = true; render(<Recipes />);
  expect(screen.getByText('라떼')).toBeTruthy();
  expect(screen.queryByLabelText('라떼 레시피 삭제')).toBeNull();
  expect(screen.queryByLabelText('레시피 카테고리 관리')).toBeNull();
  expect(screen.queryByLabelText('POS 메뉴 동기화')).toBeNull();
});
it('기존 관리 권한이 있는 직원의 목록 등록·분류·삭제 행동은 유지한다', () => {
  mockManage = true; mockRecipesPopulated = true; render(<Recipes />);
  expect(screen.getByLabelText('POS 메뉴 동기화')).toBeTruthy();
  expect(screen.getByLabelText('레시피 카테고리 관리')).toBeTruthy();
  expect(screen.getByLabelText('라떼 레시피 삭제')).toBeTruthy();
  fireEvent.press(screen.getByText('새 레시피'));
  expect(mockPush).toHaveBeenCalledWith('/recipes/new');
});

it('삭제 확인창을 연 뒤 PT 권한으로 바뀌면 이전 확인 콜백도 쓰지 않는다', () => {
  mockManage = true; mockRecipesPopulated = true;
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = render(<Recipes />);
  fireEvent.press(screen.getByLabelText('라떼 레시피 삭제'));
  const confirm = alert.mock.calls[0][2]!.find(button => button.text === '삭제')!.onPress!;
  mockManage = false; view.rerender(<Recipes />);
  confirm();
  expect(mockRemove).not.toHaveBeenCalled();
  alert.mockRestore();
});
it('PT 미확인 상태에서는 재고 수량 저장도 막는다', async () => {
  mockReady = false; render(<StockDetail />);
  await waitFor(() => expect(screen.getByLabelText('현재 재고 수량')).toBeTruthy());
  expect(screen.getByLabelText('현재 재고 수량').props.editable).toBe(false);
  fireEvent.press(screen.getByText('저장'));
  expect(mockUpdate).not.toHaveBeenCalled();
});
