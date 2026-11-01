import { render, screen } from '@testing-library/react-native';
import { AppIcon } from '../../lib/icons/AppIcon';
import { EmptyState } from '../../lib/components/ui/EmptyState';
import { illustrationAssets } from '../../lib/icons/Illustration';

it('공통 SVG에서도 호출부의 크기·색·테스트 식별자를 유지한다', () => {
  render(<AppIcon name="menu-outline" size={26} color="#3182F6" testID="menu-icon" accessible={false} />);
  const icon = screen.getByTestId('menu-icon');
  expect(icon.props.width).toBe(26);
  expect(icon.props.height).toBe(26);
  expect(icon.props.color).toBe('#3182F6');
  expect(screen.queryByText('menu-outline')).toBeNull();
});
it('제작하지 않은 서비스 심볼은 기존 라이브러리로 보존한다', () => {
  render(<AppIcon name="logo-apple" size={20} />);
  expect(screen.getByText('logo-apple')).toBeTruthy();
});
it('실패 상태 일러스트는 재시도 문구와 행동을 대체하지 않는다', () => {
  const retry = jest.fn();
  render(<EmptyState icon="alert-circle-outline" illustration="load-error" title="불러오기 실패" ctaLabel="다시 시도" onCtaPress={retry} />);
  expect(screen.getByText('불러오기 실패')).toBeTruthy();
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  const images = screen.UNSAFE_getAllByType(require('react-native').Image);
  expect(images[0].props.source).toBe(illustrationAssets['load-error']);
  expect(images[0].props.accessible).toBe(false);
});
