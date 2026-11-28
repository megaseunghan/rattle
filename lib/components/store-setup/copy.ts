/** 매장 만들기 질문 문구(s02-v16 시안)와 답한 뒤 한 줄 요약. */
import { FINANCIAL_SHARE_OPTIONS } from '../../utils/financialSharing';
import type { StoreSetupDraft, StoreSetupQuestion } from './draft';
import { closingSummary, probationSummary } from './format';

export interface QuestionCopy {
  title: string;
  description: string;
  badge?: string;
}

export function questionCopy(question: StoreSetupQuestion, draft: Pick<StoreSetupDraft, 'isOpen24h'>): QuestionCopy {
  switch (question) {
    case 'name': return { title: '매장 이름을 알려주세요', description: '사업자번호 없이 이름만으로 시작할 수 있어요.' };
    case 'address': return { title: '매장 주소를 알려주세요', badge: '선택', description: '비워 둬도 돼요. 매장 정보에서 나중에 넣을 수 있어요.' };
    case 'closing': return {
      title: '매장은 몇 시에 문을 닫나요?',
      description: draft.isOpen24h ? '24시간 영업이면 하루를 나눌 시각을 정해 주세요.' : '이 시간을 기준으로 하루 매출을 나눠요.',
    };
    case 'share': return { title: '손익을 누구와 공유할까요?', description: '공유하지 않아도 체크리스트·스케줄·본인 급여·재고를 이용할 수 있어요.' };
    case 'probation': return { title: '수습 기간이 있나요?', description: '입사일부터 계산돼요. 나중에 바꿀 수 있어요.' };
    default: return { title: '', description: '' };
  }
}

export function answerOf(question: StoreSetupQuestion, draft: StoreSetupDraft): string {
  switch (question) {
    case 'name': return draft.name.trim();
    case 'address': return draft.address.trim() || '비워 뒀어요';
    case 'closing': return closingSummary(draft.meridiem, draft.hour12, draft.isOpen24h);
    case 'share': return FINANCIAL_SHARE_OPTIONS.find(option => option.value === draft.scope)?.title ?? '';
    case 'probation': return probationSummary(draft.probationMonths, draft.rateText);
    default: return '';
  }
}

/** 하단 버튼 글자. 비어 있는 주소면 '건너뛰기'. */
export function nextLabel(question: StoreSetupQuestion, draft: StoreSetupDraft, isLast: boolean): string {
  if (isLast) return '매장 시작하기';
  if (question === 'address' && !draft.address.trim()) return '건너뛰기';
  return '다음';
}
