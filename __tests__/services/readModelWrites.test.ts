import { createEmployee, getEmployees } from '../../lib/services/employees';
import { addWageChange } from '../../lib/services/wageHistory';
import { createCategoryTaxonomy } from '../../lib/services/categoryTaxonomy';
import { changePurchaseType, getPurchaseTypes } from '../../lib/services/purchaseTypes';
import { getRecipes, getRecipeById } from '../../lib/services/recipes';
import { invalidateCachedStore } from '../../lib/services/cacheInvalidation';

const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: {
  rpc: (...args: unknown[]) => mockRpc(...args), from: (...args: unknown[]) => mockFrom(...args),
} }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn().mockResolvedValue(undefined) }));

function query(result: { data: unknown; error: unknown }) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'range', 'limit', 'insert', 'update']) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.single = jest.fn().mockResolvedValue(result);
  builder.maybeSingle = jest.fn().mockResolvedValue(result);
  builder.then = jest.fn((resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject));
  return builder;
}
const employeeInput = {
  store_id: 'store', name: '직원', employment_type: 'regular' as const, base_salary: 3000000,
  hourly_wage: null, non_taxable: 200000, joined_at: '2026-10-01', is_probation: false, dependents: 1,
};
const wageInput = {
  storeId: 'store', employeeId: 'employee', effectiveDate: '2026-11-01', baseSalary: 3200000,
  hourlyWage: null, nonTaxable: 200000,
};
const purchaseCategories = createCategoryTaxonomy('purchase_categories', ['식자재'], { table: 'purchases', column: 'category', fallback: '기타' });
beforeEach(() => { mockRpc.mockReset(); mockFrom.mockReset(); jest.mocked(invalidateCachedStore).mockClear(); });

describe('원자적 직원·급여 작성 계약', () => {
  it('직원과 초기 이력을 한 RPC로 생성하고 해당 매장 캐시를 갱신한다', async () => {
    const employee = { id: 'employee', ...employeeInput };
    const rpc = query({ data: employee, error: null });
    mockRpc.mockReturnValue(rpc);
    await expect(createEmployee(employeeInput)).resolves.toEqual(employee);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('create_employee_with_initial_wage', { p_store_id: 'store', p_employee: employeeInput });
    expect(rpc.single).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(invalidateCachedStore).toHaveBeenCalledWith('store');
  });
  it('초기 이력 생성 실패를 성공한 직원 생성으로 숨기지 않는다', async () => {
    mockRpc.mockReturnValue(query({ data: null, error: { message: 'initial wage rejected' } }));
    await expect(createEmployee(employeeInput)).rejects.toThrow('initial wage rejected');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(invalidateCachedStore).not.toHaveBeenCalled();
  });
  it('적용일과 금액을 한 RPC로 전달하고 클라이언트에서 현재 급여를 따로 덮어쓰지 않는다', async () => {
    const history = { id: 'history', employee_id: 'employee', effective_date: wageInput.effectiveDate };
    mockRpc.mockReturnValue(query({ data: history, error: null }));
    await expect(addWageChange(wageInput)).resolves.toEqual(history);
    expect(mockRpc).toHaveBeenCalledWith('add_employee_wage_change', {
      p_employee_id: 'employee', p_effective_date: '2026-11-01', p_base_salary: 3200000,
      p_hourly_wage: null, p_non_taxable: 200000, p_memo: null,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(invalidateCachedStore).toHaveBeenCalledWith('store');
  });
  it('급여 이력 쓰기 실패는 호출자에게 전달하고 캐시를 성공 처리하지 않는다', async () => {
    mockRpc.mockReturnValue(query({ data: null, error: { message: 'EMPLOYEE_FORBIDDEN' } }));
    await expect(addWageChange(wageInput)).rejects.toThrow('EMPLOYEE_FORBIDDEN');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(invalidateCachedStore).not.toHaveBeenCalled();
  });
});

describe('정규화 분류 서비스', () => {
  it('매장·도메인·활성 상태로 조회하고 빈 목록을 기본값으로 되살리지 않는다', async () => {
    const read = query({ data: [], error: null });
    mockFrom.mockReturnValue(read);
    await expect(purchaseCategories.getCategories('store')).resolves.toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith('store_taxonomies');
    expect(read.eq).toHaveBeenCalledWith('store_id', 'store');
    expect(read.eq).toHaveBeenCalledWith('domain', 'purchase');
    expect(read.eq).toHaveBeenCalledWith('is_active', true);
  });
  it.each(['rename', 'remove'] as const)('%s은 오래된 화면 목록을 다시 저장하지 않고 한 RPC로 처리한다', async action => {
    mockRpc.mockResolvedValue({ data: ['변경'], error: null });
    if (action === 'rename') await purchaseCategories.renameCategory('store', '식자재', '식품', ['오래된 목록']);
    else await purchaseCategories.removeCategory('store', '식자재', ['오래된 목록']);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('change_store_taxonomy', {
      p_store_id: 'store', p_domain: 'purchase', p_action: action, p_old_name: '식자재',
      p_new_name: action === 'rename' ? '식품' : '기타',
    });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(invalidateCachedStore).toHaveBeenCalledWith('store');
  });
  it.each(['rename', 'remove'] as const)('%s 실패를 삼키지 않는다', async action => {
    const error = { message: 'TAXONOMY_CHANGED' };
    mockRpc.mockResolvedValue({ data: null, error });
    const operation = action === 'rename'
      ? purchaseCategories.renameCategory('store', '식자재', '식품', [])
      : purchaseCategories.removeCategory('store', '식자재', []);
    await expect(operation).rejects.toEqual(error);
    expect(invalidateCachedStore).not.toHaveBeenCalled();
  });
  it('조회 실패를 빈 목록으로 숨기지 않는다', async () => {
    const error = { message: 'read failed' };
    mockFrom.mockReturnValue(query({ data: null, error }));
    await expect(purchaseCategories.getCategories('store')).rejects.toEqual(error);
  });
  it('매입 유형도 같은 도메인 RPC를 사용하며 입력을 정리한다', async () => {
    mockRpc.mockResolvedValue({ data: ['직접매입'], error: null });
    await expect(changePurchaseType('store', '수기', ' 직접매입 ')).resolves.toEqual(['직접매입']);
    expect(mockRpc).toHaveBeenCalledWith('change_store_taxonomy', {
      p_store_id: 'store', p_domain: 'purchase_type', p_old_name: '수기', p_new_name: '직접매입', p_action: 'rename',
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });
  it('매입 유형 조회 권한 오류도 기본 목록으로 바꾸지 않는다', async () => {
    const error = { message: 'forbidden' };
    mockFrom.mockReturnValue(query({ data: null, error }));
    await expect(getPurchaseTypes('store')).rejects.toEqual(error);
  });
});

const recipe = { id: 'recipe', store_id: 'store', name: '음식', selling_price: 10000, cost: 1, margin_rate: 99.99, recipe_ingredients: [] };
describe('레시피 공통 원가 View', () => {
  function mockRecipes(rows: unknown, costs: unknown, error: unknown = null) {
    const recipeQuery = query({ data: rows, error: null });
    const costsQuery = query({ data: costs, error });
    mockFrom.mockImplementation(table => {
      if (table === 'recipes') return recipeQuery;
      if (table === 'recipe_costs') return costsQuery;
      throw new Error(`Unexpected table: ${table}`);
    });
    return { recipeQuery, costsQuery };
  }
  it('목록에서 오래된 저장 원가 대신 View의 최신 원가와 마진을 사용한다', async () => {
    mockRecipes([recipe], [{ recipe_id: 'recipe', store_id: 'store', cost: 2500, margin_rate: 75 }]);
    const rows = await getRecipes('store');
    expect(rows).toEqual([{ ...recipe, cost: 2500, margin_rate: 75 }]);
    expect(mockFrom).toHaveBeenCalledWith('recipe_costs');
  });
  it('상세에서도 목록과 같은 View 원가를 사용한다', async () => {
    mockRecipes(recipe, [{ recipe_id: 'recipe', store_id: 'store', cost: 2500, margin_rate: 75 }]);
    await expect(getRecipeById('recipe')).resolves.toEqual({ ...recipe, cost: 2500, margin_rate: 75 });
    expect(mockFrom).toHaveBeenCalledWith('recipe_costs');
  });
  it.each(['list', 'detail'] as const)('%s에서 View 행이 없으면 오래된 원가를 표시하지 않는다', async mode => {
    mockRecipes(mode === 'list' ? [recipe] : recipe, []);
    await expect(mode === 'list' ? getRecipes('store') : getRecipeById('recipe')).rejects.toBeTruthy();
  });
  it.each(['list', 'detail'] as const)('%s에서 View 조회 실패를 사용자에게 성공한 조회로 반환하지 않는다', async mode => {
    mockRecipes(mode === 'list' ? [recipe] : recipe, null, { message: 'recipe view unavailable' });
    await expect(mode === 'list' ? getRecipes('store') : getRecipeById('recipe')).rejects.toBeTruthy();
  });
  it('레시피가 없는 매장은 불필요한 원가 조회 없이 빈 목록을 반환한다', async () => {
    mockRecipes([], []);
    await expect(getRecipes('store')).resolves.toEqual([]);
    expect(mockFrom).not.toHaveBeenCalledWith('recipe_costs');
  });
});


describe('현재 적용 급여 View', () => {
  const employee = { id: 'employee', ...employeeInput };
  function mockEmployeeWages(data: unknown, error: unknown = null) {
    const employeeRead = query({ data: [employee], error: null });
    const wageRead = query({ data, error });
    mockFrom.mockImplementation(table => {
      if (table === 'employees') return employeeRead;
      if (table === 'current_employee_wages') return wageRead;
      throw new Error(`Unexpected table: ${table}`);
    });
    return wageRead;
  }
  it('LEFT JOIN의 NULL 이력 행은 기존 급여를 0원으로 바꾸지 않고 누락 상태를 표시한다', async () => {
    mockEmployeeWages([{ employee_id: 'employee', wage_history_id: null, effective_date: null, base_salary: null, hourly_wage: null, non_taxable: null }]);
    await expect(getEmployees('store')).resolves.toEqual([{ ...employee, wage_history_missing: true }]);
  });
  it('실제 적용 이력의 금액을 사용하고 매장과 직원 범위를 함께 제한한다', async () => {
    const wageRead = mockEmployeeWages([{ employee_id: 'employee', wage_history_id: 'history', effective_date: '2026-10-01', base_salary: '3200000', hourly_wage: null, non_taxable: '100000' }]);
    await expect(getEmployees('store')).resolves.toEqual([{ ...employee, base_salary: 3200000, hourly_wage: null, non_taxable: 100000, wage_history_missing: false }]);
    expect(wageRead.eq).toHaveBeenCalledWith('store_id', 'store');
    expect(wageRead.in).toHaveBeenCalledWith('employee_id', ['employee']);
  });
  it('View 권한·조회 오류를 기존 직원 조건으로 숨기지 않는다', async () => {
    const error = { message: 'wages view failed' };
    mockEmployeeWages(null, error);
    await expect(getEmployees('store')).rejects.toEqual(error);
  });
});
