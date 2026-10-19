import { getErrorMessage, UserFacingError } from '../../lib/utils/error';

describe('사용자 오류 문구', () => {
  it('DB 구조와 상세 원문 대신 요청한 안내만 표시한다', () => {
    expect(getErrorMessage({ code: '42703', message: 'column payroll.worked_minutes does not exist', details: 'schema public' }, '불러오지 못했어요.')).toBe('불러오지 못했어요.');
    expect(getErrorMessage(new Error('DB 적용 상태와 연결을 확인해주세요.'), '저장하지 못했어요.')).toBe('저장하지 못했어요.');
  });
  it('영문·한국어의 알 수 없는 내부 오류를 모두 숨긴다', () => {
    expect(getErrorMessage(new Error('request failed: private-api-token'))).toBe('처리하지 못했어요. 다시 시도해주세요.');
    expect(getErrorMessage({ message: '서버 내부 처리 과정의 임의 오류' })).toBe('처리하지 못했어요. 다시 시도해주세요.');
  });
  it('입력 검증 문구는 다음 행동을 유지한다', () => {
    expect(getErrorMessage(new UserFacingError('총 근무시간을 입력해주세요.'))).toBe('총 근무시간을 입력해주세요.');
  });
  it('알려진 업무 오류는 짧은 사용자 문구로 바꾼다', () => {
    expect(getErrorMessage({ code: 'P0001', message: '이름 또는 연락처가 겹치는 직원이 있습니다. 인건비의 직원 정보와 신청 정보를 맞춘 뒤 다시 승인해주세요' })).toBe('직원 이름·연락처를 확인한 뒤 다시 승인해주세요.');
    expect(getErrorMessage(new Error('제출 내역이 변경됐습니다. 새로고침해주세요'))).toBe('내역이 변경됐어요. 새로고침해주세요.');
  });
  it('알 수 없는 업무 오류도 원문으로 노출하지 않는다', () => {
    expect(getErrorMessage({ code: 'P0001', message: 'unknown payroll database error' }, '다시 시도해주세요.')).toBe('다시 시도해주세요.');
  });
});
