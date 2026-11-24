import React from 'react';
import { render } from '@testing-library/react-native';
import { Skeleton, SkeletonGroup, SkeletonCardList, SkeletonRows, SkeletonSummary } from '../../lib/components/skeleton';

describe('Skeleton', () => {
  it('그룹은 불러오는 중임을 progressbar와 라벨로 알린다', () => {
    const { getByRole } = render(<SkeletonGroup label="매입 목록 불러오는 중"><Skeleton width={80} height={14} /></SkeletonGroup>);
    const group = getByRole('progressbar');
    expect(group.props.accessibilityLabel).toBe('매입 목록 불러오는 중');
    expect(group.props.accessibilityState).toEqual({ busy: true });
  });

  it('자리 표시 블록은 읽기 도구에서 숨긴다', () => {
    const { getByTestId } = render(<SkeletonGroup label="불러오는 중"><Skeleton testID="block" width={80} height={14} /></SkeletonGroup>);
    const block = getByTestId('block', { includeHiddenElements: true });
    expect(block.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(block.props.accessibilityElementsHidden).toBe(true);
  });

  it('그룹 밖에서도 정적인 블록으로 렌더링된다', () => {
    const { getByTestId } = render(<Skeleton testID="block" width="50%" height={10} />);
    expect(getByTestId('block', { includeHiddenElements: true })).toBeTruthy();
  });

  it('프리셋은 요청한 개수만큼 행을 그린다', () => {
    const cards = render(<SkeletonCardList count={4} label="할 일 불러오는 중" />);
    expect(cards.getAllByTestId('skeleton-card-row', { includeHiddenElements: true })).toHaveLength(4);
    const rows = render(<SkeletonRows count={6} label="매입 목록 불러오는 중" />);
    expect(rows.getAllByTestId('skeleton-row', { includeHiddenElements: true })).toHaveLength(6);
    const summary = render(<SkeletonSummary label="요약 불러오는 중" metrics={4} />);
    expect(summary.getAllByTestId('skeleton-metric', { includeHiddenElements: true })).toHaveLength(4);
  });
});
