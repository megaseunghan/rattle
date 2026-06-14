import { getProfitSentiment } from '../../lib/utils/sentimentMessage';

describe('getProfitSentiment', () => {
  test('순이익이 양수면 흑자(positive)', () => {
    // Arrange
    const netProfit = 500_000;
    const revenue = 10_000_000;

    // Act
    const result = getProfitSentiment(netProfit, revenue);

    // Assert
    expect(result.level).toBe('positive');
  });

  test('이익률 -10% 이하면 적자(negative)', () => {
    // Arrange: -1,500,000 / 10,000,000 = -15%
    const result = getProfitSentiment(-1_500_000, 10_000_000);

    // Assert
    expect(result.level).toBe('negative');
  });

  test('손익분기 근처(이익률 -10% 초과, 적자 아님)는 neutral', () => {
    // Arrange: -300,000 / 10,000,000 = -3%
    const result = getProfitSentiment(-300_000, 10_000_000);

    // Assert
    expect(result.level).toBe('neutral');
  });

  test('순이익 0은 neutral', () => {
    expect(getProfitSentiment(0, 10_000_000).level).toBe('neutral');
  });

  test('매출이 0이고 순이익이 음수면 neutral (판단 보류)', () => {
    expect(getProfitSentiment(-100_000, 0).level).toBe('neutral');
  });

  test('정확히 -10% 경계는 적자(negative)', () => {
    expect(getProfitSentiment(-1_000_000, 10_000_000).level).toBe('negative');
  });
});
