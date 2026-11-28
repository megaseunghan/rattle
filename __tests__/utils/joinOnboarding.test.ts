import { buildJoinOnboarding, draftFromProfile, OnboardingDraft } from '../../lib/utils/joinOnboarding';
import type { JoinOnboardingProfile } from '../../types';
const regular: OnboardingDraft={employmentType:'regular',incomeType:'employee',baseSalary:'3,000,000',nonTaxable:'200,000',hourlyWage:'',weeklyRest:null,weeklyMinutes:null,joinedAt:'2026-10-01',bankName:' 국민은행 ',accountNumber:'123456-123456'};
const part: OnboardingDraft={...regular,employmentType:'part_time',hourlyWage:'13,000',weeklyRest:'separate',weeklyMinutes:1230};
it('직원은 월 기본급·비과세·공통 정보를 저장한다', () => {
  expect(buildJoinOnboarding(regular)).toEqual({employment_type:'regular',income_type:'employee',base_salary:3000000,non_taxable:200000,hourly_wage:null,weekly_hours:null,weekly_minutes:null,weekly_rest_included:null,joined_at:'2026-10-01',bank_name:'국민은행',account_number:'123456123456'});
});
it('파트타이머는 분 단위 근무시간과 호환용 정수 시간(버림)·주휴를 함께 보낸다', () => {
  expect(buildJoinOnboarding(part)).toEqual(expect.objectContaining({employment_type:'part_time',hourly_wage:13000,weekly_minutes:1230,weekly_hours:20,weekly_rest_included:false,base_salary:0,non_taxable:0}));
  expect(buildJoinOnboarding({...part,weeklyRest:'included'}).weekly_rest_included).toBe(true);
  expect(buildJoinOnboarding({...part,weeklyRest:'unknown'}).weekly_rest_included).toBeNull();
});
it.each([{joinedAt:'2026-02-30'},{baseSalary:''},{nonTaxable:'9999999'},{accountNumber:'123'},{bankName:''},{incomeType:null}])('잘못된 입력 %j를 차단한다', patch => {
  expect(() => buildJoinOnboarding({...regular,...patch})).toThrow();
});
it('주 근무시간은 10분 단위, 0보다 크게 검증한다', () => {
  expect(() => buildJoinOnboarding({...part,weeklyMinutes:1235})).toThrow();
  expect(() => buildJoinOnboarding({...part,weeklyMinutes:0})).toThrow();
  expect(() => buildJoinOnboarding({...part,weeklyMinutes:null})).toThrow();
});
it('신청에서는 잘 모르겠어요를 보낼 수 있지만 최종 합류에서는 정해야 한다', () => {
  expect(buildJoinOnboarding({...regular,incomeType:'unknown'}).income_type).toBe('unknown');
  expect(() => buildJoinOnboarding({...regular,incomeType:'unknown'},'admin')).toThrow('근로자인지 프리랜서인지 정해 주세요.');
  expect(buildJoinOnboarding({...regular,incomeType:'freelancer'},'admin').income_type).toBe('freelancer');
});
it('신청에서는 주휴를 골라야 하고 최종 합류에서는 비워 둘 수 있다', () => {
  expect(() => buildJoinOnboarding({...part,weeklyRest:null})).toThrow();
  expect(buildJoinOnboarding({...part,weeklyRest:null},'admin').weekly_rest_included).toBeNull();
});
it('서버 신청을 화면 상태로 바꾸고 이전 앱 신청은 근로자·시간 단위로 읽는다', () => {
  const old = { employment_type:'part_time',hourly_wage:12000,weekly_hours:20,base_salary:0,non_taxable:0,joined_at:'2026-10-01',bank_name:'국민은행',account_number:'enc:v1:3456:abc' } as JoinOnboardingProfile;
  expect(draftFromProfile(old)).toEqual(expect.objectContaining({incomeType:'employee',weeklyMinutes:1200,weeklyRest:'unknown',accountNumber:'',hourlyWage:'12000'}));
  expect(draftFromProfile({...old,weekly_minutes:1230,weekly_rest_included:true,income_type:'unknown'})).toEqual(expect.objectContaining({incomeType:'unknown',weeklyMinutes:1230,weeklyRest:'included'}));
  expect(draftFromProfile(null).incomeType).toBeNull();
});
