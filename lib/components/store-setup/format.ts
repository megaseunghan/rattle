/** 매장 만들기(S02) 화면 문구·변환. 화면 없이 테스트할 수 있게 순수 함수만 둔다. */
import { minimumWageFor } from '../../payroll/rates';
import { isBelowProbationFloor } from '../../payroll/minimumWage';
import { PROBATION_MINIMUM_WAGE_FLOOR } from '../../payroll/probation';

export type Meridiem = '오전' | '오후';

/** 24시간 영업일 때 하루 매출을 나누는 기본 시각(오전 6시). */
export const DEFAULT_DAY_SPLIT = { meridiem: '오전' as Meridiem, hour12: 6 };
/** 닫는 시간이 있을 때 처음 보여 주는 값(오후 11시, 기존 stores.closing_time 기본 23:00). */
export const DEFAULT_CLOSING = { meridiem: '오후' as Meridiem, hour12: 11 };
/** 오전 1~5시 마감은 다음 날 새벽으로 읽는다. */
const NEXT_DAY_LAST_HOUR = 5;

export function to24h(meridiem: Meridiem, hour12: number): number {
  const h = hour12 % 12;
  return meridiem === '오후' ? h + 12 : h;
}

/** 서버 저장 형식 'HH:00'. */
export function toClosingTime(meridiem: Meridiem, hour12: number): string {
  return `${String(to24h(meridiem, hour12)).padStart(2, '0')}:00`;
}

/** '오후 11시', '자정', '다음 날 오전 2시'. */
export function closingLabel(meridiem: Meridiem, hour12: number): string {
  if (meridiem === '오전' && hour12 === 12) return '자정';
  if (meridiem === '오전' && hour12 <= NEXT_DAY_LAST_HOUR) return `다음 날 오전 ${hour12}시`;
  return `${meridiem} ${hour12}시`;
}

/** 받침이 있으면 '을', 없으면 '를'. 한글이 아니면 '를'. */
export function objectParticle(word: string): '을' | '를' {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '를';
  return code % 28 === 0 ? '를' : '을';
}

/** 휠 아래 한 줄 안내. */
export function closingNote(meridiem: Meridiem, hour12: number, isOpen24h: boolean): string {
  const label = closingLabel(meridiem, hour12);
  return isOpen24h ? `${label}${objectParticle(label)} 기준으로 하루 매출을 나눠요.` : `${label}에 닫아요.`;
}

/** 답한 뒤 줄어든 한 줄. */
export function closingSummary(meridiem: Meridiem, hour12: number, isOpen24h: boolean): string {
  const label = closingLabel(meridiem, hour12);
  return isOpen24h ? `24시간 영업 · ${label} 기준` : label;
}

/** 수습 비율 입력: 숫자만, 세 자리까지. */
export function sanitizeRateInput(text: string): string {
  return text.replace(/\D/g, '').slice(0, 3);
}

/** 1~100 사이 정수 퍼센트면 그 값, 아니면 null. */
export function parseRatePercent(text: string): number | null {
  if (!/^\d{1,3}$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 && value <= 100 ? value : null;
}

const won = (value: number): string => `${Math.round(value).toLocaleString('ko-KR')}원`;

export interface RateNote {
  text: string;
  /** 굵게 보여 줄 부분(최저임금 90% 안내). */
  strong?: string;
  tail?: string;
}

/**
 * 수습 비율 아래 안내. exampleHourly는 예시 시급(최저임금)이며 모르면 null.
 * 최저임금 90%보다 적어도 막지 않고 안내만 한다(DESIGN.md 확정).
 */
export function probationRateNote(rateText: string, exampleHourly: number | null): RateNote {
  const rate = parseRatePercent(rateText);
  if (rate == null) return { text: '1~100% 사이로 적어 주세요.' };
  if (rate === 100) return { text: '100%면 수습이어도 급여를 줄이지 않아요.' };
  if (exampleHourly == null) return { text: '직원마다 합류 승인 때 바꿀 수 있어요.' };
  const wage = exampleHourly * rate / 100;
  if (isBelowProbationFloor({ hourlyWage: wage }, exampleHourly, PROBATION_MINIMUM_WAGE_FLOOR)) {
    return {
      text: `예: 시급 ${won(exampleHourly)}이면 ${won(wage)}이에요. `,
      strong: `최저임금의 90%(${won(exampleHourly * PROBATION_MINIMUM_WAGE_FLOOR)})보다 적게 줄 수는 없어요.`,
      tail: ' 합류 승인 때 다시 알려 드릴게요.',
    };
  }
  return { text: `예: 시급 ${won(exampleHourly)}이면 수습 중 ${won(wage)}이에요. 직원마다 합류 승인 때 바꿀 수 있어요.` };
}

/** 기기 시간 기준 오늘 'YYYY-MM-DD'. */
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 예시 시급: 그날의 최저임금. 기준표에 없는 날이면 null(예시 없이 안내). */
export function exampleHourlyOn(date: string): number | null {
  try { return minimumWageFor(date); } catch { return null; }
}

export type ProbationMonths = 0 | 1 | 2 | 3;

export function probationSummary(months: ProbationMonths, rateText: string): string {
  if (months === 0) return '없음';
  const rate = parseRatePercent(rateText);
  return `${months}개월 · 급여 ${rate ?? '?'}%`;
}

/** 'K7Q2M9XA4RTDP8WE' → 'K7Q2-M9XA-4RTD-P8WE'. 이미 하이픈이 있어도 같은 모양. */
export function formatInviteCode(code: string): string {
  const raw = code.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return raw.match(/.{1,4}/g)?.join('-') ?? raw;
}

/** 화면 읽기에서 한 글자씩 읽도록 띄운다. */
export function spokenInviteCode(code: string): string {
  return formatInviteCode(code).replace(/-/g, '').split('').join(' ');
}

/** 공유 문구. 멤버 관리(S35)의 공유 문구와 같은 뜻을 유지한다. */
export function inviteShareMessage(storeName: string, code: string): string {
  return `${storeName} 직원 참여코드: ${formatInviteCode(code)}\n래틀 앱 → 기존 매장 참여에서 입력해주세요. 코드는 발급일부터 7일간 사용할 수 있어요.`;
}
