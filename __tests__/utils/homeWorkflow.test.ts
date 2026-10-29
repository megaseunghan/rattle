import { DEFAULT_HOME_WORKFLOW, isHomeWorkflow } from '../../lib/utils/homeWorkflow';
it('빈 단계와 순서가 있는 유효한 설정을 허용한다', () => {
  expect(isHomeWorkflow(DEFAULT_HOME_WORKFLOW)).toBe(true);
  expect(isHomeWorkflow({ open: [], business: ['stock', 'purchase'], close: [] })).toBe(true);
});
it('누락, 중복, 알 수 없는 기능과 추가 필드를 거부한다', () => {
  for (const value of [null, [], {}, { open: [], business: [] }, { open: ['stock', 'stock'], business: [], close: [] }, { open: ['payroll_admin'], business: [], close: [] }, { ...DEFAULT_HOME_WORKFLOW, extra: [] }]) expect(isHomeWorkflow(value)).toBe(false);
});
