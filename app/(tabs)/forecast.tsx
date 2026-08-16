import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { getAllItemSpend, getBudgets, getTopMerchantsThisMonth, MerchantSummary } from '../../db/queries';
import { calculateForecast, findBiggestTrendShift, CategoryForecast, ForecastInsight } from '../../lib/forecast';
import { getCategoryMeta } from '../../constants/categories';
import { formatRupiah, toTitleCase } from '../../lib/format';
import { colors, spacing, radius } from '../../constants/theme';
import StateView from '../../components/StateView';

export default function ForecastScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [forecasts, setForecasts] = useState<CategoryForecast[]>([]);
  const [topMerchants, setTopMerchants] = useState<MerchantSummary[]>([]);
  const [insight, setInsight] = useState<ForecastInsight | null>(null);
  const [budgets, setBudgetsState] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      async function load() {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

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
      }
      load();
      return () => {
        isActive = false;
      };
    }, [db])
  );

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
  const topCategory = forecasts[0];

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
                <Ionicons name="options-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.setBudgetHeaderText}>Budgets</Text>
              </TouchableOpacity>
            </View>

            {/* Top Category Hero Banner */}
            {topCategory && (
              <View style={styles.heroCard}>
                <View style={styles.heroLeft}>
                  <Text style={styles.heroLabel}>Top Category This Month</Text>
                  <Text style={styles.heroCategory}>{topCategory.category}</Text>
                  <Text style={styles.heroAmount}>{formatRupiah(topCategory.totalThisMonth)}</Text>
                </View>
                <View style={styles.heroIconBadge}>
                  <Ionicons name="trending-up" size={24} color="#FFFFFF" />
                </View>
              </View>
            )}

            {/* Smart Insight Banner */}
            {insight && (
              <View style={styles.insightCard}>
                <View
                  style={[
                    styles.insightIconBadge,
                    { backgroundColor: insight.percentChange > 0 ? '#FEF2F2' : '#ECFDF5' },
                  ]}
                >
                  <Ionicons
                    name={insight.percentChange > 0 ? 'arrow-up' : 'arrow-down'}
                    size={16}
                    color={insight.percentChange > 0 ? colors.error : colors.success}
                  />
                </View>
                <Text style={styles.insightText}>
                  Your <Text style={styles.boldText}>{insight.category}</Text> spending is{' '}
                  <Text style={{ color: insight.percentChange > 0 ? colors.error : colors.success }}>
                    {Math.abs(insight.percentChange)}% {insight.percentChange > 0 ? 'higher' : 'lower'}
                  </Text>{' '}
                  than earlier this month.
                </Text>
              </View>
            )}

            {/* TOP PLACES THIS MONTH SECTION */}
            {topMerchants.length > 0 && (
              <View style={styles.merchantSection}>
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
                          <Text style={styles.merchantRowName} numberOfLines={1}>
                            {m.merchantName}
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
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Category Projections</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const meta = getCategoryMeta(item.category);
          const budgetLimit = budgets[item.category] ?? null;
          const percent = budgetLimit ? item.totalThisMonth / budgetLimit : 0;
          const isOverBudget = !!budgetLimit && percent >= 1;
          const isNearBudget = !!budgetLimit && percent >= 0.75 && percent < 1;
          const budgetColor = percent >= 1 ? colors.error : percent >= 0.75 ? colors.warning : colors.success;

          return (
            <TouchableOpacity
              style={[
                styles.categoryCard,
                isOverBudget && styles.cardOverBudget,
                isNearBudget && styles.cardNearBudget,
              ]}
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
                    {isOverBudget ? (
                      <Text style={styles.overBudgetLabel}>Over Budget</Text>
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

                <Text style={styles.categoryCurrentTotal}>{formatRupiah(item.totalThisMonth)}</Text>
              </View>

              {/* Progress Bar of Category Share */}
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${(item.totalThisMonth / maxTotal) * 100}%`, backgroundColor: meta.color },
                  ]}
                />
              </View>

              {/* Stats Footer: Weekly Avg & Projected End of Month */}
              <View style={styles.statsRow}>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>Weekly average</Text>
                  <Text style={styles.statValue}>{formatRupiah(item.weeklyAverage)}</Text>
                </View>
                <View style={styles.statColRight}>
                  <Text style={styles.statLabel}>Est. end of month</Text>
                  <Text style={styles.projectedValue}>{formatRupiah(item.projectedEndOfMonth)}</Text>
                </View>
              </View>

              {/* Optional Budget Track */}
              {budgetLimit ? (
                <View style={styles.budgetRow}>
                  <View style={styles.budgetTrack}>
                    <View
                      style={[
                        styles.budgetFill,
                        { width: `${Math.min(percent, 1) * 100}%`, backgroundColor: budgetColor },
                      ]}
                    />
                  </View>
                  <Text style={styles.budgetText}>
                    {formatRupiah(item.totalThisMonth)} / {formatRupiah(budgetLimit)} budget
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
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 26,
    color: '#0F172A',
    letterSpacing: -0.6,
  },
  setBudgetHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  setBudgetHeaderText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  heroLeft: { flex: 1 },
  heroLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroCategory: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 18,
    color: '#FFFFFF',
    marginTop: 2,
  },
  heroAmount: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#CBD5E1',
    marginTop: 2,
  },
  heroIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  insightIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightText: {
    flex: 1,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  boldText: {
    fontFamily: 'Manrope_700Bold',
    color: '#0F172A',
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
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#94A3B8',
  },
  merchantGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  merchantRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  merchantRankCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  merchantRankText: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 12,
    color: '#0F172A',
  },
  merchantRowDetails: {
    flex: 1,
    marginRight: 8,
  },
  merchantRowName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#0F172A',
  },
  merchantRowSub: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  merchantRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  merchantRowAmount: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 14,
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  sectionHeader: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardOverBudget: {
    borderColor: colors.error,
  },
  cardNearBudget: {
    borderColor: colors.warning,
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
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: '#0F172A',
  },
  overBudgetLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    color: colors.error,
    marginTop: 1,
  },
  trendLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    marginTop: 1,
  },
  trendLabelMuted: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  categoryCurrentTotal: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 16,
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  barTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  statCol: {
    flex: 1,
  },
  statColRight: {
    alignItems: 'flex-end',
  },
  statLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: '#64748B',
  },
  statValue: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: '#334155',
    marginTop: 2,
  },
  projectedValue: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 13,
    color: '#0F172A',
    marginTop: 2,
  },
  budgetRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  budgetTrack: {
    height: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 2,
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: 2,
  },
  budgetText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
});
