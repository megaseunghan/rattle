import { render } from '@testing-library/react-native';
import { JoinOnboardingFields } from '../../lib/components/JoinOnboardingFields';
import type { OnboardingDraft } from '../../lib/utils/joinOnboarding';
const value: OnboardingDraft = { employmentType: 'part_time', hourlyWage: '', weeklyHours: '', baseSalary: '', nonTaxable: '0', joinedAt: '', bankName: '', accountNumber: '' };
it('관리자 입력에는 해당 급여 칸의 안내를 표시한다', () => {
  const view = render(<JoinOnboardingFields admin value={value} onChange={jest.fn()} />);
  expect(view.getByText('시급을 입력해주세요')).toBeTruthy();
  view.rerender(<JoinOnboardingFields admin value={{ ...value, employmentType: 'regular' }} onChange={jest.fn()} />);
  expect(view.queryByText('시급을 입력해주세요')).toBeNull(); expect(view.getByText('월급을 입력해주세요')).toBeTruthy();
});
it('직원 신청 입력에는 새 관리자 필수 안내를 강제하지 않는다', () => {
  const view = render(<JoinOnboardingFields value={value} onChange={jest.fn()} />);
  expect(view.getByLabelText('시급')).toBeTruthy(); expect(view.queryByText('시급을 입력해주세요')).toBeNull();
});
