import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { getAllItemSpend, getBudgets, getTopMerchantsThisMonth, MerchantSummary } from '../../db/queries';
import { calculateForecast, findBiggestTrendShift, getTopSpendingCategory, CategoryForecast, ForecastInsight } from '../../lib/forecast';
import { currentMonthRange } from '../../lib/date';
import { getCategoryMeta } from '../../constants/categories';
import { formatRupiah, toTitleCase, normalizeMerchantName } from '../../lib/format';
import { colors, spacing, radius, typography, shadow } from '../../constants/theme';
import StateView from '../../components/StateView';
import AnimatedNumber from '../../components/AnimatedNumber';

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  const widthPercent = `${Math.min(Math.max(percent, 0), 1) * 100}%`;
  return <View style={[styles.budgetFill, { width: widthPercent as any, backgroundColor: color }]} />;
}

export default function ForecastScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [forecasts, setForecasts] = useState<CategoryForecast[]>([]);
  const [topMerchants, setTopMerchants] = useState<MerchantSummary[]>([]);
  const [insight, setInsight] = useState<ForecastInsight | null>(null);
  const [budgets, setBudgetsState] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      async function load() {
        try {
          setHasError(false);
          const { start: monthStart, end: monthEnd } = currentMonthRange();

          const [records, budgetData, merchants] = await Promise.all([
            getAllItemSpend(db),
            getBudgets(db),
            getTopMerchantsThisMonth(db, monthStart, monthEnd),
          ]);

          const result = calculateForecast(records);
          const trend = findBiggestTrendShift(records);
          if (isActive) {
            setForecasts(result);
            setTopMerchants(merchants);
            setInsight(trend);
            setBudgetsState(budgetData);
            setIsLoading(false);
          }
        } catch (err) {
          console.error('[ForecastScreen] load error:', err);
          if (isActive) {
            setIsLoading(false);
            setHasError(true);
          }
        }
      }
      load();
      return () => {
        isActive = false;
      };
    }, [db, retryToken])
  );

  if (hasError) {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
        <StateView
          icon="alert-circle-outline"
          iconTone="error"
          title="Could not load forecast"
          subtitle="Something went wrong while loading your spending outlook."
          primaryLabel="Try Again"
          onPrimaryPress={() => {
            setIsLoading(true);
            setHasError(false);
            setRetryToken((n) => n + 1);
          }}
        />
      </View>
    );
  }

  if (!isLoading && forecasts.length === 0) {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
        <StateView
          icon="stats-chart-outline"
          title="No spending data yet"
          subtitle="Scan a receipt to start tracking your spending this month."
        />
      </View>
    );
  }

  const maxTotal = Math.max(...forecasts.map((f) => f.totalThisMonth), 1);
  const totalCurrent = forecasts.reduce((sum, f) => sum + f.totalThisMonth, 0);
  const totalProjected = forecasts.reduce((sum, f) => sum + (f.projectedEndOfMonth || f.totalThisMonth), 0);
  const topCategory = getTopSpendingCategory(forecasts);

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <FlatList
        style={styles.flex}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 90 }]}
        data={forecasts}
        keyExtractor={(item) => item.category}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ paddingTop: Math.max(insets.top, 16) }}>
            {/* Header: Title & Action */}
            <View style={styles.headerSection}>
              <Text style={styles.headerTitle}>Forecast</Text>
              <TouchableOpacity
                style={styles.setBudgetHeaderBtn}
                onPress={() => router.push('/budget')}
                activeOpacity={0.7}
              >
                <Ionicons name="options-outline" size={14} color={colors.textOnPrimary} style={{ marginRight: 4 }} />
                <Text style={styles.setBudgetHeaderText}>Budgets</Text>
              </TouchableOpacity>
            </View>

            {/* Smart Assistant Hero */}
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>Projected month-end</Text>
              <AnimatedNumber value={totalProjected} formatter={formatRupiah} style={styles.heroProjectedValue} />
              
              <View style={styles.heroDivider} />

              <Text style={styles.heroSubNarrative}>
                You've spent <Text style={styles.heroSubBold}>{formatRupiah(totalCurrent)}</Text> so far.
                {insight && insight.percentChange > 0
                  ? ` ${insight.category} spending is unusually high.`
                  : insight && insight.percentChange < 0
                    ? ` ${insight.category} spending is remarkably low.`
                    : topCategory
                      ? ` ${topCategory.category} is your biggest expense.`
                      : " You're off to a good start."}
              </Text>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Category Projections</Text>
            </View>
          </View>
        }
        ListFooterComponent={
          topMerchants.length > 0 ? (
            <View style={[styles.merchantSection, { marginTop: spacing.xl }]}>
              <View style={styles.merchantSectionHeader}>
                <Text style={styles.sectionTitle}>Top Places This Month</Text>
                <Text style={styles.merchantSectionSub}>By spending</Text>
              </View>

              <View style={styles.merchantGroupCard}>
                {topMerchants.map((m, idx) => {
                  const isLast = idx === topMerchants.length - 1;
                  return (
                    <TouchableOpacity
                      key={m.merchantName}
                      style={[styles.merchantRow, !isLast && styles.merchantRowDivider]}
                      onPress={() => router.push(`/merchant/${encodeURIComponent(m.merchantName)}`)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.merchantRankCircle}>
                        <Text style={styles.merchantRankText}>{idx + 1}</Text>
                      </View>

                      <View style={styles.merchantRowDetails}>
                        <Text style={styles.merchantRowName} numberOfLines={2}>
                          {normalizeMerchantName(m.merchantName)}
                        </Text>
                        <Text style={styles.merchantRowSub}>
                          {m.visitCount} transaction{m.visitCount === 1 ? '' : 's'}
                        </Text>
                      </View>

                      <View style={styles.merchantRowRight}>
                        <Text style={styles.merchantRowAmount}>{formatRupiah(m.totalAmount)}</Text>
                        <Ionicons name="chevron-forward" size={14} color="#94A3B8" style={{ marginLeft: 4 }} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const meta = getCategoryMeta(item.category);
          const budgetLimit = budgets[item.category] ?? null;
          const percent = budgetLimit ? item.totalThisMonth / budgetLimit : 0;
          const isOverBudget = !!budgetLimit && percent >= 1;
          const isNearBudget = !!budgetLimit && percent >= 0.75 && percent < 1;
          const budgetColor = percent >= 1 ? colors.error : percent >= 0.75 ? colors.warning : colors.success;

          return (
            <TouchableOpacity
              style={styles.categoryCard}
              onPress={() => router.push({ pathname: '/category/[name]', params: { name: item.category } })}
              activeOpacity={0.7}
            >
              {/* Top Row: Category Icon, Name & Current Month Spend */}
              <View style={styles.cardHeader}>
                <View style={styles.categoryInfoGroup}>
                  <View style={[styles.iconBadge, { backgroundColor: meta.color + '15' }]}>
                    <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                  </View>
                  <View>
                    <Text style={styles.categoryName}>{item.category}</Text>
                    {item.category === 'Other' ? (
                      <Text style={styles.trendLabelMuted}>Uncategorized & minor expenses</Text>
                    ) : isOverBudget ? (
                      <Text style={styles.overBudgetLabel}>Over Budget</Text>
                    ) : item.isNewCategory ? (
                      <Text style={styles.trendLabelMuted}>New</Text>
                    ) : item.isLowBaseline && item.monthOverMonthDiff !== null ? (
                      <Text
                        style={[
                          styles.trendLabel,
                          { color: item.monthOverMonthDiff > 0 ? colors.error : colors.success },
                        ]}
                      >
                        {item.monthOverMonthDiff > 0 ? '+' : ''}
                        {formatRupiah(item.monthOverMonthDiff)} vs last month
                      </Text>
                    ) : item.monthOverMonthPercent !== null ? (
                      <Text
                        style={[
                          styles.trendLabel,
                          { color: item.monthOverMonthPercent > 0 ? colors.error : colors.success },
                        ]}
                      >
                        {item.monthOverMonthPercent > 0 ? '+' : ''}
                        {item.monthOverMonthPercent}% vs last month
                      </Text>
                    ) : (
                      <Text style={styles.trendLabelMuted}>First month</Text>
                    )}
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <AnimatedNumber value={item.projectedEndOfMonth} formatter={formatRupiah} style={styles.projectedValueHero} />
                  <Text style={styles.projectedLabel}>est. end</Text>
                </View>
              </View>

              {/* Stats Footer: Spent so far & Weekly Avg */}
              <View style={styles.statsRow}>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>Spent so far</Text>
                  <AnimatedNumber value={item.totalThisMonth} formatter={formatRupiah} style={styles.statValue} />
                </View>
                <View style={styles.statColRight}>
                  <Text style={styles.statLabel}>Weekly average</Text>
                  <AnimatedNumber value={item.weeklyAverage} formatter={formatRupiah} style={styles.statValue} />
                </View>
              </View>

              {/* Optional Budget Track */}
              {budgetLimit ? (
                <View style={styles.budgetRow}>
                  <View style={styles.budgetTrack}>
                    <ProgressBar percent={percent} color={budgetColor} />
                  </View>
                  <Text style={styles.budgetText}>
                    {isOverBudget 
                      ? `Over by ${formatRupiah(item.totalThisMonth - budgetLimit)}` 
                      : `${formatRupiah(item.totalThisMonth)} / ${formatRupiah(budgetLimit)} budget`}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FAFAFA' },
  listContent: {
    paddingHorizontal: spacing.md,
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    ...typography.h1,
  },
  setBudgetHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  setBudgetHeaderText: {
    ...typography.caption,
    color: colors.textOnPrimary,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  heroLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroProjectedValue: {
    ...typography.h1,
    fontSize: 32,
    color: colors.textPrimary,
  },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  heroSubNarrative: {
    ...typography.bodySecondary,
    lineHeight: 22,
  },
  heroSubBold: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  merchantSection: {
    marginBottom: spacing.md,
  },
  merchantSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs + 2,
  },
  merchantSectionSub: {
    ...typography.caption,
  },
  merchantGroupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  merchantRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  merchantRankCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  merchantRankText: {
    ...typography.numberSecondary,
  },
  merchantRowDetails: {
    flex: 1,
    marginRight: 8,
  },
  merchantRowName: {
    ...typography.h4,
    marginBottom: 2,
  },
  merchantRowSub: {
    ...typography.caption,
  },
  merchantRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  merchantRowAmount: {
    ...typography.numberSecondary,
  },
  sectionHeader: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...typography.h3,
  },
  categoryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  categoryInfoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    ...typography.h4,
  },
  overBudgetLabel: {
    ...typography.caption,
    color: colors.error,
    marginTop: 1,
  },
  trendLabel: {
    ...typography.caption,
    marginTop: 1,
  },
  trendLabelMuted: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 1,
  },
  projectedValueHero: {
    ...typography.numberPrimary,
  },
  projectedLabel: {
    ...typography.caption,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  statCol: {
    flex: 1,
  },
  statColRight: {
    alignItems: 'flex-end',
  },
  statLabel: {
    ...typography.caption,
  },
  statValue: {
    ...typography.numberSecondary,
    marginTop: 2,
  },
  budgetRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  budgetTrack: {
    height: 4,
    backgroundColor: colors.background,
    borderRadius: 2,
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: 2,
  },
  budgetText: {
    ...typography.caption,
    marginTop: 4,
  },
});
