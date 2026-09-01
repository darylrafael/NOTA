import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Modal,
  FlatList,
  SafeAreaView
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { 
  getMonthlyItemSpend, 
  getAllReceipts, 
  getTopMerchants, 
  getBiggestExpenses,
  TopMerchant, 
  ReceiptSummary, 
  ItemSpendRecord 
} from '../../db/queries';
import { colors, typography, spacing, radius, shadow } from '../../constants/theme';
import { formatRupiah, normalizeMerchantName } from '../../lib/format';
import { getCategoryMeta } from '../../constants/categories';
import TransactionCard from '../../components/TransactionCard';
import { calculateForecast } from '../../lib/forecast';
import AnimatedNumber from '../../components/AnimatedNumber';

export default function InsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();

  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    return d;
  });

  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [merchantSort, setMerchantSort] = useState<'spending' | 'frequency'>('spending');
  
  const [isLoading, setIsLoading] = useState(true);
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [itemSpends, setItemSpends] = useState<ItemSpendRecord[]>([]);
  const [topMerchants, setTopMerchants] = useState<TopMerchant[]>([]);
  const [biggestExpenses, setBiggestExpenses] = useState<ReceiptSummary[]>([]);
  const [prevMonthTotal, setPrevMonthTotal] = useState(0);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const start = new Date(currentDate);
      const end = new Date(currentDate);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);

      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}T23:59:59.999Z`;

      const loadedReceipts = await getAllReceipts(db, { startDate: startStr, endDate: endStr });
      setReceipts(loadedReceipts);

      const spends = await getMonthlyItemSpend(db, startStr, endStr);
      setItemSpends(spends);

      const merchants = await getTopMerchants(db, startStr, endStr, merchantSort);
      setTopMerchants(merchants);

      const bigExps = await getBiggestExpenses(db, startStr, endStr, 5);
      setBiggestExpenses(bigExps);

      const prevStart = new Date(currentDate);
      prevStart.setMonth(prevStart.getMonth() - 1);
      const prevEnd = new Date(prevStart);
      prevEnd.setMonth(prevEnd.getMonth() + 1);
      prevEnd.setDate(0);

      const prevStartStr = `${prevStart.getFullYear()}-${String(prevStart.getMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
      const prevEndStr = `${prevEnd.getFullYear()}-${String(prevEnd.getMonth() + 1).padStart(2, '0')}-${String(prevEnd.getDate()).padStart(2, '0')}T23:59:59.999Z`;
      const prevSpends = await getMonthlyItemSpend(db, prevStartStr, prevEndStr);
      
      setPrevMonthTotal(prevSpends.reduce((sum, s) => sum + s.amount, 0));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [db, currentDate, merchantSort]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePrevMonth = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const handleNextMonth = () => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  const now = new Date();
  const isFutureMonth = useMemo(() => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() + 1);
    return next > now;
  }, [currentDate]);

  const isCurrentMonth = useMemo(() => {
    return currentDate.getMonth() === now.getMonth() && currentDate.getFullYear() === now.getFullYear();
  }, [currentDate]);

  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const prevMonthLabel = useMemo(() => {
    const p = new Date(currentDate);
    p.setMonth(p.getMonth() - 1);
    return p.toLocaleDateString('en-US', { month: 'long' });
  }, [currentDate]);

  const prevMonthStartIso = useMemo(() => {
    const p = new Date(currentDate);
    p.setMonth(p.getMonth() - 1);
    return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
  }, [currentDate]);

  const totalSpent = useMemo(() => itemSpends.reduce((sum, r) => sum + r.amount, 0), [itemSpends]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of itemSpends) {
      map.set(s.category, (map.get(s.category) || 0) + s.amount);
    }
    return Array.from(map.entries())
      .map(([cat, amt]) => ({ category: cat, amount: amt, percentage: totalSpent > 0 ? Math.round((amt / totalSpent) * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [itemSpends, totalSpent]);

  const getMoMText = () => {
    if (prevMonthTotal === 0 && totalSpent > 0) return 'New spending this month';
    if (prevMonthTotal === 0 && totalSpent === 0) return '';
    const diff = totalSpent - prevMonthTotal;
    if (diff === 0) return `No change vs ${prevMonthLabel}`;
    const pct = Math.round((Math.abs(diff) / prevMonthTotal) * 100);
    const arrow = diff > 0 ? '\u2191' : '\u2193';
    return `${arrow} ${formatRupiah(Math.abs(diff))} (${pct.toLocaleString('en-US')}%) vs ${prevMonthLabel}`;
  };

  const getInsightText = () => {
    if (totalSpent === 0) return '';
    const topCat = categoryBreakdown[0];
    if (topCat && topCat.percentage > 35) {
      return `Most of your spending went to ${topCat.category}. It accounted for ${topCat.percentage}% of your spending.`;
    }
    if (topMerchants.length > 0 && topMerchants[0].visitCount >= 8) {
      return `You visited ${normalizeMerchantName(topMerchants[0].merchantName)} ${topMerchants[0].visitCount} times this month.`;
    }
    const diff = totalSpent - prevMonthTotal;
    if (prevMonthTotal > 0 && diff > 0) {
      const pct = Math.round((Math.abs(diff) / prevMonthTotal) * 100);
      if (pct > 20) return `Your spending increased ${pct}% compared with ${prevMonthLabel}.`;
    }
    if (biggestExpenses.length > 0) {
      return `Your largest single expense was ${formatRupiah(biggestExpenses[0].totalAmount)} at ${normalizeMerchantName(biggestExpenses[0].merchantName)}.`;
    }
    if (topMerchants.length > 0) {
      return `${normalizeMerchantName(topMerchants[0].merchantName)} was your highest expense, taking up ${Math.round((topMerchants[0].totalAmount/totalSpent)*100)}% of your spending.`;
    }
    return "You're pacing well this month.";
  };

  const renderMonthPicker = () => {
    const months = [];
    const n = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(n.getFullYear(), n.getMonth() - i, 1);
      months.push(d);
    }
    return (
      <Modal visible={showMonthPicker} animationType="slide" transparent>
        <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={styles.pickerContainer}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Month</Text>
              <TouchableOpacity onPress={() => setShowMonthPicker(false)}>
                <Text style={{ fontFamily: 'Manrope_600SemiBold', color: colors.accent, fontSize: 16 }}>Close</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={months}
              keyExtractor={(d) => d.toISOString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    setCurrentDate(item);
                    setShowMonthPicker(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, item.getTime() === currentDate.getTime() && { color: colors.primary, fontFamily: 'Manrope_700Bold' }]}>
                    {item.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>
    );
  };

  const forecasts = isCurrentMonth ? calculateForecast(itemSpends, currentDate, []) : [];

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.navArrow} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}>
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowMonthPicker(true)} style={styles.monthLabelBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Text style={styles.monthLabel}>{monthLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNextMonth} disabled={isFutureMonth} style={[styles.navArrow, isFutureMonth && { opacity: 0.3 }]} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}>
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerSide} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
        
        {isCurrentMonth && prevMonthTotal > 0 && (
          <View style={styles.reviewCardContainer}>
            <TouchableOpacity 
              style={styles.reviewCard}
              onPress={() => router.push(`/review/${prevMonthStartIso}`)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.reviewTitle}>{prevMonthLabel} in Review</Text>
                <Text style={styles.reviewSub}>See where your money went last month</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={colors.textSecondary} style={{ marginLeft: 16 }} />
            </TouchableOpacity>
          </View>
        )}

        {totalSpent === 0 && !isLoading ? (
          <View style={styles.heroSection}>
            <Text style={styles.heroPretitle}>{monthLabel.toUpperCase()}</Text>
            <Text style={styles.heroTitle}>TOTAL SPENT</Text>
            <Text style={styles.heroValue}>Rp0</Text>
            <Text style={styles.heroSubMuted}>No spending yet</Text>
            {prevMonthTotal > 0 && <Text style={styles.heroPrevMuted}>Your {prevMonthLabel} spending was {formatRupiah(prevMonthTotal)}.</Text>}
          </View>
        ) : (
          <View style={styles.heroSection}>
            <Text style={styles.heroPretitle}>{monthLabel.toUpperCase()}</Text>
            <Text style={styles.heroTitle}>TOTAL SPENT</Text>
            <Text style={styles.heroValue}>{formatRupiah(totalSpent)}</Text>
            {getMoMText() !== '' && <Text style={styles.heroMom}>{getMoMText()}</Text>}
            <Text style={styles.heroSub}>{receipts.length} transaction{receipts.length !== 1 ? 's' : ''}</Text>
          </View>
        )}

        {totalSpent > 0 && (
          <View style={styles.insightSection}>
            <View style={styles.insightBox}>
              <Text style={styles.insightText}>{getInsightText()}</Text>
            </View>
          </View>
        )}

        {topMerchants.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Top Merchants</Text>
            </View>
            <View style={styles.segmentControl}>
              <TouchableOpacity 
                style={[styles.segmentBtn, merchantSort === 'spending' && styles.segmentBtnActive]} 
                onPress={() => setMerchantSort('spending')}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentText, merchantSort === 'spending' && styles.segmentTextActive]}>By Spending</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.segmentBtn, merchantSort === 'frequency' && styles.segmentBtnActive]} 
                onPress={() => setMerchantSort('frequency')}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentText, merchantSort === 'frequency' && styles.segmentTextActive]}>By Frequency</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.merchantsList}>
              {topMerchants.slice(0, 5).map((m, idx) => (
                <TouchableOpacity 
                  key={m.merchantName} 
                  style={styles.merchantRow}
                  onPress={() => router.push(`/merchant/${encodeURIComponent(m.merchantName)}?start=${currentDate.toISOString()}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.merchantRank}><Text style={styles.merchantRankText}>{idx + 1}</Text></View>
                  <View style={styles.merchantInfo}>
                    <Text style={styles.merchantName} numberOfLines={1}>{normalizeMerchantName(m.merchantName)}</Text>
                    <Text style={styles.merchantSub}>{m.visitCount} transaction{m.visitCount !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={styles.merchantRight}>
                    <Text style={styles.merchantAmount}>{formatRupiah(m.totalAmount)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {biggestExpenses.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Biggest Expenses</Text>
            </View>
            <View style={styles.biggestList}>
              {biggestExpenses.map((exp, idx) => (
                <TransactionCard
                  key={exp.id}
                  id={exp.id}
                  merchantName={normalizeMerchantName(exp.merchantName)}
                  dateDisplay={new Date(exp.purchaseDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()}
                  primaryCategory={exp.categories[0] || 'Other'}
                  totalAmount={exp.totalAmount}
                  onPress={() => router.push(`/receipt/${exp.id}`)}
                />
              ))}
            </View>
          </View>
        )}

        {categoryBreakdown.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Categories</Text>
            </View>
            <View style={styles.categoriesList}>
              {categoryBreakdown.map(cat => {
                const meta = getCategoryMeta(cat.category);
                return (
                  <View key={cat.category} style={styles.catRow}>
                    <View style={[styles.catIcon, { backgroundColor: meta.color + '15' }]}>
                      <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                    </View>
                    <View style={styles.catInfo}>
                      <Text style={styles.catName} numberOfLines={1}>{cat.category}</Text>
                      <View style={styles.catBarTrack}>
                        <View style={[styles.catBarFill, { width: `${cat.percentage}%`, backgroundColor: meta.color }]} />
                      </View>
                    </View>
                    <View style={styles.catRight}>
                      <Text style={styles.catAmount}>{formatRupiah(cat.amount)}</Text>
                      <Text style={styles.catPct}>{cat.percentage}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {isCurrentMonth && totalSpent > 0 && forecasts.length > 0 && (
          <View style={[styles.section, { marginTop: spacing.md }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Forecast</Text>
            </View>
            <View style={styles.forecastCard}>
              <Text style={styles.forecastLabel}>Projected month-end</Text>
              <Text style={styles.forecastHero}>{formatRupiah(forecasts.reduce((sum, f) => sum + (f.projectedEndOfMonth || 0), 0))}</Text>
            </View>
          </View>
        )}
      </ScrollView>
      {renderMonthPicker()}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    height: 56,
  },
  headerSide: { flex: 1, justifyContent: 'center' },
  monthNav: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  navArrow: { padding: spacing.xs },
  monthLabelBtn: { paddingHorizontal: 16 },
  monthLabel: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: colors.textPrimary },
  
  reviewCardContainer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card
  },
  reviewTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
  reviewSub: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: colors.textSecondary },

  heroSection: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  heroPretitle: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: colors.textTertiary, letterSpacing: 1, marginBottom: 8 },
  heroTitle: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: colors.textSecondary, letterSpacing: 0.5, marginBottom: 6 },
  heroValue: { ...typography.numberHero, fontSize: 36, marginBottom: 12 },
  heroMom: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: colors.textPrimary, marginBottom: 4 },
  heroSub: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: colors.textTertiary },
  heroSubMuted: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: colors.textTertiary, marginBottom: 8 },
  heroPrevMuted: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: colors.textSecondary },

  insightSection: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  insightBox: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  insightText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 22,
    textAlign: 'center',
  },

  section: {
    marginBottom: spacing.xxl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
  },
  
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: radius.pill,
    padding: 2,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  segmentBtnActive: {
    backgroundColor: '#FFF',
    ...shadow.card,
  },
  segmentText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: colors.textTertiary,
  },
  segmentTextActive: {
    color: colors.textPrimary,
  },

  merchantsList: {
    paddingHorizontal: spacing.xl,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  merchantRank: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  merchantRankText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: colors.textSecondary },
  merchantInfo: { flex: 1, marginRight: 16 },
  merchantName: { ...typography.body, marginBottom: 2 },
  merchantSub: { ...typography.caption, color: colors.textTertiary },
  merchantRight: { alignItems: 'flex-end', minWidth: 80 },
  merchantAmount: { ...typography.numberSecondary, fontSize: 14 },

  biggestList: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },

  categoriesList: {
    paddingHorizontal: spacing.xl,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  catIcon: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  catInfo: { flex: 1, paddingRight: 20 },
  catName: { ...typography.body, marginBottom: 8 },
  catBarTrack: { height: 4, backgroundColor: '#F1F5F9', borderRadius: 2 },
  catBarFill: { height: 4, borderRadius: 2 },
  catRight: { alignItems: 'flex-end', width: 90 },
  catAmount: { ...typography.numberSecondary, fontSize: 14, marginBottom: 2 },
  catPct: { ...typography.caption, color: colors.textTertiary },

  forecastCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  forecastLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: 8 },
  forecastHero: { ...typography.numberHero, fontSize: 26, color: colors.primary },
  
  pickerContainer: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  pickerTitle: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  pickerItem: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  pickerItemText: { fontFamily: 'Manrope_500Medium', fontSize: 15, textAlign: 'center', color: colors.textPrimary }
});
