/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { NumericText } from './NumericText';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../../constants/colors';
import { Type } from '../../../constants/designTokens';
import { Fonts } from '../../../constants/fonts';

interface SubMetric {
  label: string;
  value: string;
  change?: string;
  isNegativeChange?: boolean;
}

interface SummaryCardProps {
  label: string;
  amount: string;
  changeLabel?: string;
  isNegativeChange?: boolean;
  subMetrics?: SubMetric[];
}

export function SummaryCard({ label, amount, changeLabel, isNegativeChange, subMetrics }: SummaryCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        {changeLabel && (
          <Text style={[styles.changeBadge, isNegativeChange ? styles.negative : styles.positive]}>
            {changeLabel}
          </Text>
        )}
      </View>
      <NumericText style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{amount}</NumericText>

      {subMetrics && subMetrics.length > 0 && (
        <>
          <View style={styles.divider} />
          <View style={styles.subRow}>
            {subMetrics.map((metric) => (
              <View key={metric.label} style={styles.subMetric}>
                <Text style={styles.subLabel}>{metric.label}</Text>
                <NumericText style={styles.subValue}>{metric.value}</NumericText>
                {metric.change && (
                  <Text style={[styles.subChange, metric.isNegativeChange ? styles.negative : styles.positive]}>
                    {metric.change}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderColor: Colors.homeBorder,
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: {
    fontSize: Type.sm,
    fontWeight: '500',
    color: Colors.gray500,
  },
  changeBadge: {
    fontSize: Type.xs,
    fontWeight: '700',
  },
  amount: {
    fontSize: 28,
    fontFamily: Fonts.spaceGroteskBold,
    fontWeight: '700',
    color: Colors.black,
    letterSpacing: -0.5,
    marginTop: 10,
  },
  divider: {
    height: 0.5,
    backgroundColor: Colors.homeBorder,
    marginVertical: 14,
  },
  subRow: {
    flexDirection: 'row',
  },
  subMetric: {
    flex: 1,
    gap: 2,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '400',
    color: Colors.gray400,
  },
  subValue: {
    fontSize: Type.base,
    fontWeight: '700',
    color: Colors.black,
  },
  subChange: {
    fontSize: 11,
    fontWeight: '600',
  },
  positive: {
    color: Colors.positive,
  },
  negative: {
    color: Colors.negative,
  },
});
