import { buildJoinOnboarding, OnboardingDraft } from '../../lib/utils/joinOnboarding';
const regular: OnboardingDraft={employmentType:'regular',baseSalary:'3,000,000',nonTaxable:'200,000',hourlyWage:'',weeklyHours:'',joinedAt:'2026-10-01',bankName:' 국민은행 ',accountNumber:'123456-123456'};
it('직원은 월 기본급·비과세·공통 정보를 저장한다', () => {
  expect(buildJoinOnboarding(regular)).toEqual({employment_type:'regular',base_salary:3000000,non_taxable:200000,hourly_wage:null,weekly_hours:null,joined_at:'2026-10-01',bank_name:'국민은행',account_number:'123456123456'});
});
it('파트 전환 시 숨겨진 월급 값은 전송하지 않는다', () => {
  expect(buildJoinOnboarding({...regular,employmentType:'part_time',hourlyWage:'13,000',weeklyHours:'20'})).toEqual(expect.objectContaining({employment_type:'part_time',hourly_wage:13000,weekly_hours:20,base_salary:0,non_taxable:0}));
});
it.each([{joinedAt:'2026-02-30'},{baseSalary:''},{nonTaxable:'9999999'},{accountNumber:'123'},{bankName:''}])('잘못된 입력 %j를 차단한다', patch => {
  expect(() => buildJoinOnboarding({...regular,...patch})).toThrow();
});
it('주 근무시간은 0~168 정수로 검증한다', () => {
  expect(() => buildJoinOnboarding({...regular,employmentType:'part_time',hourlyWage:'13000',weeklyHours:'20.5'})).toThrow();
});
