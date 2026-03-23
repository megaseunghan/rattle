import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ErrorMessage } from '../../lib/components/ErrorMessage';

describe('ErrorMessage 컴포넌트', () => {
  it('에러 메시지를 표시한다', () => {
    const { getByText } = render(
      <ErrorMessage message="데이터를 불러올 수 없습니다" />
    );
    expect(getByText('데이터를 불러올 수 없습니다')).toBeTruthy();
  });

  it('onRetry가 없으면 다시 시도 버튼이 표시되지 않는다', () => {
    const { queryByText } = render(
      <ErrorMessage message="오류 발생" />
    );
    expect(queryByText('다시 시도')).toBeNull();
  });

  it('onRetry가 있으면 다시 시도 버튼이 표시되고 클릭 가능하다', () => {
    const onRetry = jest.fn();
    const { getByText } = render(
      <ErrorMessage message="오류 발생" onRetry={onRetry} />
    );

    const button = getByText('다시 시도');
    expect(button).toBeTruthy();

    fireEvent.press(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
