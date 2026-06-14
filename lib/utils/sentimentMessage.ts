/**
 * Emotionally Aware Modes — 월 손익 결과를 감성적 맥락으로 전달
 *
 * 순이익과 매출을 받아 흑자/손익분기/적자 구간별 피드백 메시지를 반환한다.
 * 색상은 constants/colors.ts의 sentiment 토큰과 매핑된다.
 */

export type SentimentLevel = 'positive' | 'neutral' | 'negative';

export interface SentimentFeedback {
  level: SentimentLevel;
  message: string;
}

// 이익률(순이익/매출) 기준 적자 판단선: -10% 이하면 적자 메시지
const NEGATIVE_MARGIN_THRESHOLD = -10;

const FEEDBACK: Record<SentimentLevel, SentimentFeedback> = {
  positive: {
    level: 'positive',
    message: '이번 달도 흑자예요. 잘 운영하고 계세요!',
  },
  neutral: {
    level: 'neutral',
    message: '거의 다 왔어요. 다음 달엔 꼭 흑자로!',
  },
  negative: {
    level: 'negative',
    message: '이번 달은 쉽지 않았네요. 원가율을 확인해볼게요',
  },
};

/**
 * 월 순이익·매출 기준 감성 피드백 산출
 * - 순이익 > 0: 흑자 (positive)
 * - 이익률 <= -10%: 적자 (negative)
 * - 그 외(손익분기 근처): neutral
 */
export function getProfitSentiment(
  netProfit: number,
  revenue: number,
): SentimentFeedback {
  const marginRate = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  if (netProfit > 0) return FEEDBACK.positive;
  if (marginRate <= NEGATIVE_MARGIN_THRESHOLD) return FEEDBACK.negative;
  return FEEDBACK.neutral;
}
