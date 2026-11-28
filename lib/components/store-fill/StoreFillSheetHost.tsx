import type { StoreFillPatch } from '../../../types';
import type { StoreFillValues } from '../../utils/storeFill';
import type { IndustrialAccidentIndustry } from '../../services/industrialAccident';
import type { FillSheetKind } from './StoreFillGroups';
import { CloseDaySheet, HolidaySheet, PayDaySheet } from './PaydaySheets';
import { BusinessNumberSheet, BusinessTypeSheet } from './BusinessSheets';
import { HeadcountSheet, IndustrySheet, InsuranceSheet } from './InsuranceSheets';
import { INDUSTRY_OTHER } from './storeFillCopy';

export interface StoreFillSheetHostProps {
  sheet: FillSheetKind | null;
  values: StoreFillValues;
  saving: boolean;
  error: string | null;
  headcountReference: number | null;
  industries: { data: IndustrialAccidentIndustry[] | undefined; loading: boolean; failed: boolean; retry: () => void };
  industryOther: boolean;
  onClose: () => void;
  /** 저장 후 이어서 열 시트(없으면 닫고 '저장했어요') */
  onSave: (patch: StoreFillPatch, next?: FillSheetKind) => void;
  onIndustryOther: () => void;
}

/** 열린 시트 하나만 보인다. 모든 시트를 늘 그려 두어 닫힘 움직임이 끊기지 않게 한다. */
export function StoreFillSheetHost(props: StoreFillSheetHostProps) {
  const { sheet, values, saving, error, onClose, onSave, headcountReference, industries, industryOther, onIndustryOther } = props;
  const base = { values, saving, onClose };
  const err = (kind: FillSheetKind) => (sheet === kind ? error : null);
  return (
    <>
      <CloseDaySheet {...base} visible={sheet === 'close'} error={err('close')}
        onSave={patch => onSave(patch, values.payday_day == null ? 'pay' : undefined)} />
      <PayDaySheet {...base} visible={sheet === 'pay'} error={err('pay')} onSave={patch => onSave(patch)} />
      <HolidaySheet {...base} visible={sheet === 'holiday'} error={err('holiday')} onSave={patch => onSave(patch)} />
      <HeadcountSheet {...base} visible={sheet === 'headcount'} error={err('headcount')} reference={headcountReference}
        onSave={patch => onSave(patch)} />
      <BusinessTypeSheet {...base} visible={sheet === 'business'} error={err('business')} onSave={patch => onSave(patch)} />
      <BusinessNumberSheet {...base} visible={sheet === 'bizNumber'} error={err('bizNumber')} onSave={patch => onSave(patch)} />
      <InsuranceSheet {...base} visible={sheet === 'insurance'} error={err('insurance')}
        onPick={enrolled => onSave({ social_insurance_enrolled: enrolled },
          enrolled && values.industrial_accident_industry == null ? 'industry' : undefined)} />
      <IndustrySheet {...base} visible={sheet === 'industry'} error={err('industry')}
        industries={industries.data} industriesLoading={industries.loading} industriesFailed={industries.failed}
        onRetryIndustries={industries.retry}
        selected={values.industrial_accident_industry ?? (industryOther ? INDUSTRY_OTHER : null)}
        onPick={code => (code === INDUSTRY_OTHER ? onIndustryOther() : onSave({ industrial_accident_industry: code }))} />
    </>
  );
}
