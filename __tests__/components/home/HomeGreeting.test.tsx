import { render } from '@testing-library/react-native';
import { greetingText, HomeGreeting } from '../../../lib/components/home/HomeGreeting';

const mockAuth = { user: { user_metadata: { full_name: '승한' } } as unknown, storeRole: 'owner' as string | null };
jest.mock('../../../lib/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));

// 한국 시각 = UTC + 9시간
const kst = (hour: number) => new Date(Date.UTC(2026, 10, 28, hour - 9, 30));

describe('greetingText', () => {
  it('한국 시각으로 오픈·영업 중·마감 인사를 고른다', () => {
    expect(greetingText('승한', kst(9))).toBe('승한님, 오픈 준비할 시간이에요');
    expect(greetingText('승한', kst(14))).toBe('승한님, 영업 중이에요');
    expect(greetingText('승한', kst(22))).toBe('승한님, 오늘도 수고했어요');
  });
  it('이름이 없으면 이름 없이 인사한다', () => {
    expect(greetingText(null, kst(14))).toBe('영업 중이에요');
  });
});

it('직책을 함께 보여 준다', () => {
  const screen = render(<HomeGreeting />);
  expect(screen.getByText('사장님')).toBeTruthy();
  expect(screen.getByText(/^승한님, /)).toBeTruthy();
});
