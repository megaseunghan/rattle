import { render } from '@testing-library/react-native';
import { ChecklistProgress } from '../../lib/components/ChecklistProgress';
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
it('현재 완료율을 표시하고 갱신·체크해제 시 같은 진행영역을 유지한다', () => {
 const v=render(<ChecklistProgress done={2} total={5} scopeKey="s" />);
 expect(v.getByText('40% 완료')).toBeTruthy();
 v.rerender(<ChecklistProgress done={5} total={5} scopeKey="s" />);
 expect(v.getByText('100% 완료')).toBeTruthy();
 v.rerender(<ChecklistProgress done={1} total={5} scopeKey="s" />);
 expect(v.getByText('20% 완료')).toBeTruthy();
 expect(v.getByRole('progressbar').props.accessibilityValue.now).toBe(20);
});
it('미등록 항목을 0% 완료로 표시하지 않는다', () => {
 const v=render(<ChecklistProgress done={0} total={0} scopeKey="s" />);
 expect(v.queryByRole('progressbar')).toBeNull();
});
it('매장·구간 전환에는 이전 완료율을 표시하지 않는다', () => {
 const v=render(<ChecklistProgress done={5} total={5} scopeKey="s1" />);
 v.rerender(<ChecklistProgress done={0} total={5} scopeKey="s2" />);
 expect(v.getByText('0% 완료')).toBeTruthy();
});
