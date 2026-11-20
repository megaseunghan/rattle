import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, fireEventAsync, render, renderAsync, screen } from '@testing-library/react-native';
import StockDetail from '../../app/stock/[id]';
import StockNew from '../../app/stock/new';
import RecipeDetail from '../../app/recipes/[id]';
import RecipeNew from '../../app/recipes/new';
import Recipes from '../../app/recipes';
import { StockScreen } from '../../app/(tabs)/stock';

let mockManage = false;
let mockMode = 'self';
let mockRecipeIngredients: any[] = [];
let mockPickerIngredients: any[] = [];
let mockAdmin = false;
let mockReady = true;
let mockParams: { id?: string } = { id: 'i' };
let mockPrice: number | null = 3;
let mockRecipeCost: number | null = 0;
let mockItemStore = 's';
let mockRecipesPopulated = false;
const mockUpdate = jest.fn(), mockCreate = jest.fn(), mockRemove = jest.fn(), mockPush = jest.fn();
const mockRefetch = jest.fn();
const mockIngredient = () => ({ id: 'i', store_id: mockItemStore, name: '우유', category: '유제품', unit: 'mL', current_stock: 10, min_stock: 2, last_price: mockPrice });
const mockRecipe = () => ({ id: 'r', store_id: mockItemStore, name: '라떼', category: '음료', selling_price: 5000, cost: mockRecipeCost, margin_rate: mockRecipeCost === null ? null : 100, recipe_ingredients: mockRecipeIngredients });
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: (...args: unknown[]) => mockPush(...args) }, useLocalSearchParams: () => mockParams, useFocusEffect: (callback: () => unknown) => {
  const React = require('react'); React.useEffect(callback, [callback]);
} }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' }, store: { id: 's' }, devPreviewMode: mockMode, currentRole: mockAdmin ? 'admin' : 'member' }) }));
jest.mock('../../lib/hooks/useStorePermissions', () => ({ useStorePermissions: () => ({ canReadRecipes: true, canManageRecipes: mockManage, canManageStock: mockManage, canAdjustStock: mockReady, isPartTime: !mockManage, isAdmin: mockAdmin, permissionsReady: mockReady }) }));
jest.mock('../../lib/hooks/useIngredients', () => ({ useIngredients: () => ({ data: mockPickerIngredients, loading: false, hasMore: false, refetch: mockRefetch, update: mockUpdate, create: mockCreate }) }));
jest.mock('../../lib/hooks/useRecipes', () => ({ useRecipes: () => ({ data: mockRecipesPopulated ? [mockRecipe()] : [], loading: false, hasMore: false, refetch: mockRefetch, remove: mockRemove, create: mockCreate, bulkUpdateCategory: jest.fn() }) }));
jest.mock('../../lib/hooks/useCategories', () => ({ useCategories: () => ({ categories: ['유제품'], refetch: mockRefetch }) }));
jest.mock('../../lib/hooks/useTossSync', () => ({ useTossSync: () => ({ syncCatalog: jest.fn() }) }));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: () => jest.fn() }));
jest.mock('../../lib/services/ingredients', () => ({ getIngredientById: jest.fn(async () => mockIngredient()), updateIngredient: jest.fn(), createIngredient: jest.fn() }));
jest.mock('../../lib/services/recipes', () => ({ getRecipeById: jest.fn(async () => mockRecipe()), deleteRecipe: (...args: unknown[]) => mockRemove(...args), getRecipesByCategory: jest.fn(async () => []), upsertRecipesFromCatalog: jest.fn(), updateRecipeFull: jest.fn() }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/components/GlassBackdrop', () => ({ GlassBackdrop: () => null }));
jest.mock('../../lib/components/CategoryManageModal', () => ({ CategoryManageModal: () => null }));
jest.mock('../../lib/components/CatalogImportModal', () => ({ CatalogImportModal: () => null }));
jest.mock('../../lib/components/BulkCategoryModal', () => ({ BulkCategoryModal: () => null }));
jest.mock('../../lib/components/ui/SheetModal', () => ({ SheetModal: ({ visible, children }: any) => visible ? children : null }));
beforeEach(() => { jest.clearAllMocks(); mockRecipeCost = 0; mockPrice = 3; mockManage = false; mockMode='self'; mockRecipeIngredients=[];mockPickerIngredients=[]; mockAdmin = false; mockReady = true; mockParams = { id: 'i' }; mockItemStore = 's'; mockRecipesPopulated = false; mockUpdate.mockResolvedValue(undefined); });
it('PT 재고 상세는 수량만 편집하고 저장 payload도 한 필드뿐이다', async () => {
  await renderAsync(<StockDetail />);
  expect(screen.getByLabelText('현재 재고 수량')).toBeTruthy();
  for (const label of ['식자재명', '품절 임박 기준', '식자재 단가']) expect(screen.getByLabelText(label).props.editable).toBe(false);
  expect(screen.getByRole('radio', { name: 'kg' })).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText('현재 재고 수량'), '25');
  await fireEventAsync.press(screen.getByText('저장'));
  expect(mockUpdate).toHaveBeenCalledWith('i', { current_stock: 25 });
  expect(mockUpdate).toHaveBeenCalledTimes(1);
});
it('확인된 관리자는 기존 재고 전체 필드 저장을 유지한다', async () => {
  mockManage = true; mockAdmin = true;
  await renderAsync(<StockDetail />);
  expect(screen.getByLabelText('식자재명')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('식자재명'), '새 우유');
  await fireEventAsync.press(screen.getByText('저장'));
  expect(mockUpdate).toHaveBeenCalledWith('i', expect.objectContaining({ name: '새 우유', category: '유제품', unit: 'mL', min_stock: 2 }));
});
it('미확인 단가는 빈칸으로 읽고 이름만 수정하면 단가를 보내지 않는다', async () => {
  mockManage = true; mockAdmin = true; mockPrice = null;
  await renderAsync(<StockDetail />);
  expect(screen.getByLabelText('식자재 단가').props.value).toBe('');
  fireEvent.changeText(screen.getByLabelText('식자재명'), '새 우유');
  await fireEventAsync.press(screen.getByText('저장'));
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty('last_price');
});
it('타매장 품목은 편집 폼과 저장을 열지 않는다', async () => {
  mockItemStore = 'other';
  await renderAsync(<StockDetail />);
  expect(screen.getByText('현재 매장의 식자재가 아니에요.')).toBeTruthy();
  expect(screen.queryByText('저장')).toBeNull();
  expect(mockUpdate).not.toHaveBeenCalled();
});
it('PT의 직접 재고 신규 경로를 차단한다', () => {
  render(<StockNew />);
  expect(screen.getByText('식자재 등록 권한이 없어요.')).toBeTruthy();
  expect(screen.queryByPlaceholderText('예) 원두, 우유, 설탕')).toBeNull();
  expect(mockCreate).not.toHaveBeenCalled();
});
it.each([undefined, 'r'])('PT 직접 레시피 신규/수정 경로를 차단한다: %s', id => {
  mockParams = { id }; render(<RecipeNew />);
  expect(screen.getByText('레시피는 조회만 할 수 있어요. 등록·수정은 관리자나 담당 직원에게 요청해 주세요.')).toBeTruthy();
  expect(screen.queryByText('재료 추가')).toBeNull();
  expect(mockCreate).not.toHaveBeenCalled();
});
it('PT는 레시피 상세를 읽지만 수정·삭제 행동은 없다', async () => {
  mockParams = { id: 'r' };
  await renderAsync(<RecipeDetail />);
  expect(screen.getByText('라떼')).toBeTruthy();
  expect(screen.queryByText('수정')).toBeNull();
  expect(screen.queryByText('레시피 삭제')).toBeNull();
});
it('조회된 원가가 미확인이면 상세는 원가와 마진에 확인 필요를 표시한다', async () => {
  mockRecipeCost = null;
  mockRecipeIngredients = [{ id: 'line', ingredient: mockIngredient(), quantity: 1, unit: 'mL' }];
  await renderAsync(<RecipeDetail />);
  expect(screen.getAllByText('확인 필요')).toHaveLength(3);
});
it('PT 독립 목록은 POS 동기화·분류관리·등록을 제공하지 않는다', () => {
  render(<Recipes />);
  expect(screen.queryByLabelText('POS 메뉴 동기화')).toBeNull();
  expect(screen.queryByLabelText('레시피 카테고리 관리')).toBeNull();
  expect(screen.queryByText('레시피 등록')).toBeNull();
});
it('PT 재고 탭에서 레시피 세그먼트를 열 수 있고 빈 화면의 등록 CTA는 없다', () => {
  render(<StockScreen />);
  expect(screen.queryByText('재고 등록')).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: '레시피' }));
  expect(screen.getByText('등록된 레시피가 없어요')).toBeTruthy();
  expect(screen.queryByText('레시피 등록')).toBeNull();
  expect(screen.queryByLabelText('레시피 추가')).toBeNull();
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
  mockReady = false;
  await renderAsync(<StockDetail />);
  expect(screen.getByLabelText('현재 재고 수량')).toBeTruthy();
  expect(screen.getByLabelText('현재 재고 수량').props.editable).toBe(false);
  await fireEventAsync.press(screen.getByText('저장'));
  expect(mockUpdate).not.toHaveBeenCalled();
});
it('레시피 상세는 첫 조회 실패 뒤 재시도 성공 시 오류를 지운다', async () => {
 const read=require('../../lib/services/recipes').getRecipeById as jest.Mock;
 read.mockRejectedValueOnce(new Error('offline'));
  await renderAsync(<RecipeDetail />);
  expect(screen.getByText('다시 시도')).toBeTruthy();
  await fireEventAsync.press(screen.getByText('다시 시도'));
  expect(screen.getByText('레시피 상세')).toBeTruthy();
  expect(screen.queryByText('다시 시도')).toBeNull();
});
it('재고 상세는 첫 조회 실패를 읽기 재시도만으로 복구한다', async () => {
 const read=require('../../lib/services/ingredients').getIngredientById as jest.Mock;
 read.mockRejectedValueOnce(new Error('offline'));
  await renderAsync(<StockDetail />);
  expect(screen.getByText('다시 시도')).toBeTruthy();
  await fireEventAsync.press(screen.getByText('다시 시도'));
  expect(screen.getByLabelText('현재 재고 수량')).toBeTruthy();
  expect(mockUpdate).not.toHaveBeenCalled();
});
it('재고 저장 뒤 캐시 갱신 실패는 재저장을 막고 읽기로 복구한다', async () => {
 mockUpdate.mockResolvedValueOnce({...mockIngredient(),cacheRefreshFailed:true});
  await renderAsync(<StockDetail />);
  expect(screen.getByLabelText('현재 재고 수량')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('현재 재고 수량'),'25');
  await fireEventAsync.press(screen.getByText('저장'));
  expect(screen.getByText('저장된 재고 다시 불러오기')).toBeTruthy();
  await fireEventAsync.press(screen.getByText('저장'));
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  await fireEventAsync.press(screen.getByText('저장된 재고 다시 불러오기'));
  expect(screen.queryByText('저장된 재고 다시 불러오기')).toBeNull();
  expect(mockUpdate).toHaveBeenCalledTimes(1);
});

it('역할 표시가 관리 가능해도 미리보기의 레시피 수정은 서버를 호출하지 않는다', async () => {
 mockManage=true;mockAdmin=true;mockMode='regular';mockParams={id:'r'};
 mockRecipeIngredients=[{ingredient:mockIngredient(),quantity:1,unit:'mL'}];
  await renderAsync(<RecipeNew />);
  expect(screen.getByPlaceholderText('예) 아메리카노').props.value).toBe('라떼');
  fireEvent.changeText(screen.getByPlaceholderText('예) 아메리카노'),'수정한 이름');
  await fireEventAsync.press(screen.getByText('저장'));
  expect(require('../../lib/services/recipes').updateRecipeFull).not.toHaveBeenCalled();
});

it('레시피 미리보기에서 식자재를 빠르게 등록하지 않는다', async () => {
 mockManage=true;mockAdmin=true;mockMode='regular';mockParams={};
  await renderAsync(<RecipeNew />);
  fireEvent.press(screen.getByText('+ 추가'));
  fireEvent.press(screen.getByText('+ 새 식자재 등록'));
  fireEvent.changeText(screen.getByPlaceholderText('식자재명'),'가상 재료');
  fireEvent.changeText(screen.getByPlaceholderText('단위 (g, ml…)'),'g');
  await fireEventAsync.press(screen.getByText('등록 후 추가'));
  expect(require('../../lib/services/ingredients').createIngredient).not.toHaveBeenCalled();
});
it('레시피 미리보기에서 개당 용량을 저장하지 않는다', async () => {
 mockManage=true;mockAdmin=true;mockMode='regular';mockParams={};mockPickerIngredients=[{...mockIngredient(),unit:'개'}];
  await renderAsync(<RecipeNew />);
  fireEvent.press(screen.getByText('+ 추가'));
  fireEvent.press(screen.getByLabelText('우유, 개, 추가'));
  fireEvent.changeText(screen.getByPlaceholderText('예: 500'),'500');
  await fireEventAsync.press(screen.getByLabelText('개당 용량 저장'));
  expect(require('../../lib/services/ingredients').updateIngredient).not.toHaveBeenCalled();
});
