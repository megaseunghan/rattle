import React from 'react';
import { render } from '@testing-library/react-native';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';

describe('LoadingSpinner 컴포넌트', () => {
  it('ActivityIndicator를 렌더링한다', () => {
    const { UNSAFE_getByType } = render(<LoadingSpinner />);
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('fullScreen=false일 때도 렌더링된다', () => {
    const { UNSAFE_getByType } = render(<LoadingSpinner fullScreen={false} />);
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });
});
