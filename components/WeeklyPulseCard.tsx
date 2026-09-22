import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius, typography, shadow } from '../constants/theme';
import { formatRupiah } from '../lib/format';
import { WeeklyPulseData } from '../lib/weeklyPulse';

interface WeeklyPulseCardProps {
  data: WeeklyPulseData;
}

export default function WeeklyPulseCard({ data }: WeeklyPulseCardProps) {
  const router = useRouter();

  const handlePress = () => {
    // Navigate to Insights or a filtered history (using Insights as it's the analytical destination)
    router.push('/insights');
  };

  let comparisonText: string | null = null;
  let comparisonColor = colors.textSecondary;

  if (data.previousWeekTotal === null) {
    comparisonText = "Your first week is taking shape.";
  } else {
    const absDelta = Math.abs(data.weekOverWeekAbsoluteDelta);
    if (data.weekOverWeekAbsoluteDelta > 0) {
      // Spent more
      comparisonText = `${formatRupiah(absDelta)} more than last week`;
      // Don't make it red, just neutral to avoid judgment, or subtle gray
      comparisonColor = colors.textSecondary; 
    } else if (data.weekOverWeekAbsoluteDelta < 0) {
      comparisonText = `${formatRupiah(absDelta)} less than last week`;
      comparisonColor = colors.success; // A subtle green is nice for spending less
    } else {
      comparisonText = "Exactly the same as last week";
    }
  }

  // If no transactions, just show a minimal empty state card
  if (data.transactionCount === 0) {
    return (
      <TouchableOpacity 
        style={styles.card} 
        activeOpacity={0.8}
        onPress={handlePress}
      >
        <Text style={styles.eyebrow}>WEEKLY PULSE</Text>
        <Text style={styles.emptyText}>Nothing logged yet this week.</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity 
      style={styles.card} 
      activeOpacity={0.8}
      onPress={handlePress}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>LAST WEEK</Text>
      </View>
      
      <Text style={styles.amount}>{formatRupiah(data.currentWeekTotal)}</Text>
      
      {comparisonText && (
        <Text style={[styles.comparison, { color: comparisonColor }]}>
          {comparisonText}
        </Text>
      )}

      {data.insightText && (
        <View style={styles.insightBox}>
          <Ionicons name="sparkles" size={14} color={colors.accent} style={{ marginTop: 2 }} />
          <Text style={styles.insightText}>{data.insightText}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    ...shadow.card,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  eyebrow: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  amount: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 24,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  comparison: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    marginBottom: spacing.md,
  },
  insightBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  insightText: {
    flex: 1,
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
    gap: spacing.md,
  },
  emptyIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  emptyText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 0,
  }
});





