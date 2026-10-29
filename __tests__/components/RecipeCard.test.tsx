import { render, screen } from '@testing-library/react-native';
import { RecipeCard } from '../../lib/components/RecipeCard';
import type { RecipeWithIngredients } from '../../lib/services/recipes';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

function recipe(price: number | null | undefined): RecipeWithIngredients {
  return {
    id: 'recipe', name: '메뉴', category: '음료', selling_price: 1000,
    recipe_ingredients: price === undefined ? [] : [{
      quantity: 1, unit: '개', ingredient: { name: '재료', unit: '개', last_price: price },
    }],
  } as RecipeWithIngredients;
}

it('재료 미등록과 단가 미확인을 무료 재료로 표시하지 않는다', () => {
  const { rerender } = render(<RecipeCard recipe={recipe(undefined)} onDelete={jest.fn()} />);
  expect(screen.getByText('재료 미등록')).toBeTruthy();
  expect(screen.queryByText('100.0%')).toBeNull();
  rerender(<RecipeCard recipe={recipe(null)} onDelete={jest.fn()} />);
  expect(screen.getByText('재료 단가를 확인해주세요')).toBeTruthy();
  expect(screen.queryByText('100.0%')).toBeNull();
});

it('실제 0원 재료는 계산하고 손실 마진은 음수로 표시한다', () => {
  const { rerender } = render(<RecipeCard recipe={recipe(0)} onDelete={jest.fn()} />);
  expect(screen.getByText('100.0%')).toBeTruthy();
  rerender(<RecipeCard recipe={recipe(1500)} onDelete={jest.fn()} />);
  expect(screen.getByText('-50.0%')).toBeTruthy();
});
