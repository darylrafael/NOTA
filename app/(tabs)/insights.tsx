import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
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
  TopMerchant, 
  ReceiptSummary, 
  ItemSpendRecord 
} from '../../db/queries';
import { colors, typography, spacing, radius, shadow } from '../../constants/theme';
import { formatRupiah, normalizeMerchantName } from '../../lib/format';
import { getCategoryMeta } from '../../constants/categories';
import { calculateForecast } from '../../lib/forecast';

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
    
    if (pct > 50 && diff < 0 && totalSpent < (prevMonthTotal * 0.2)) {
      return `${arrow} ${formatRupiah(Math.abs(diff))} vs ${prevMonthLabel}`;
    }
    
    if (pct > 999) {
      return `${arrow} ${formatRupiah(Math.abs(diff))} vs ${prevMonthLabel}`;
    }
    
    return `${arrow} ${formatRupiah(Math.abs(diff))} (${pct}%) vs ${prevMonthLabel}`;
  };

  const getInsightText = () => {
    if (totalSpent === 0) return '';
    const topCat = categoryBreakdown[0];
    if (topCat && topCat.percentage > 35) {
      return `Most of your spending went to ${topCat.category} (${topCat.percentage}% of total expenses).`;
    }
    if (topMerchants.length > 0 && topMerchants[0].visitCount >= 5) {
      return `You visited ${normalizeMerchantName(topMerchants[0].merchantName)} ${topMerchants[0].visitCount} times this month.`;
    }
    const diff = totalSpent - prevMonthTotal;
    if (prevMonthTotal > 0 && diff > 0) {
      const pct = Math.round((Math.abs(diff) / prevMonthTotal) * 100);
      if (pct > 20) return `Your spending increased ${pct}% compared with ${prevMonthLabel}.`;
    }
    if (topMerchants.length > 0) {
      const pct = Math.round((topMerchants[0].totalAmount / totalSpent) * 100);
      return `${normalizeMerchantName(topMerchants[0].merchantName)} was your largest merchant expense (${pct}% of spending).`;
    }
    return 'Your spending is pacing steadily this month.';
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
              <Ionicons name="chevron-down" size={13} color={colors.textTertiary} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNextMonth} disabled={isFutureMonth} style={[styles.navArrow, isFutureMonth && { opacity: 0.3 }]} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}>
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerSide} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
        
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
              <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} style={{ marginLeft: 16 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* Hero Section */}
        {totalSpent === 0 && !isLoading ? (
          <View style={styles.heroSection}>
            <Text style={styles.heroEyebrow}>TOTAL SPENT</Text>
            <Text style={styles.heroValue}>Rp0</Text>
            <View style={styles.heroMetaPill}>
              <Text style={styles.heroMetaText}>0 transactions {'\u2022'} No spending yet</Text>
            </View>
            <Text style={styles.heroPrevMuted}>Your {monthLabel.split(' ')[0]} spending will appear here.</Text>
          </View>
        ) : (
          <View style={styles.heroSection}>
            <Text style={styles.heroEyebrow}>TOTAL SPENT</Text>
            <Text style={styles.heroValue}>{formatRupiah(totalSpent)}</Text>
            <View style={styles.heroMetaPill}>
              <Text style={styles.heroMetaText}>
                {getMoMText() !== '' ? `${getMoMText()}  \u2022  ` : ''}
                {`${receipts.length} transaction${receipts.length !== 1 ? 's' : ''}`}
              </Text>
            </View>
          </View>
        )}

        {/* Editorial Insight Card */}
        {totalSpent > 0 && (
          <View style={styles.insightSection}>
            <View style={styles.insightBox}>
              <View style={styles.insightIconCircle}>
                <Ionicons name="sparkles" size={14} color={colors.primary} />
              </View>
              <Text style={styles.insightText}>{getInsightText()}</Text>
            </View>
          </View>
        )}

        {/* Top Merchants Section */}
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
                  <View style={styles.merchantRank}>
                    <Text style={styles.merchantRankText}>{idx + 1}</Text>
                  </View>
                  <View style={styles.merchantInfo}>
                    <Text style={styles.merchantName} numberOfLines={1}>{normalizeMerchantName(m.merchantName)}</Text>
                    <Text style={styles.merchantSub}>
                      {merchantSort === 'frequency' 
                        ? `${m.visitCount} visits  \u2022  Avg ${formatRupiah(Math.round(m.totalAmount / m.visitCount))}`
                        : `${m.visitCount} transaction${m.visitCount !== 1 ? 's' : ''}`}
                    </Text>
                  </View>
                  <View style={styles.merchantRight}>
                    <Text style={styles.merchantAmount}>{formatRupiah(m.totalAmount)}</Text>
                    <Ionicons name="chevron-forward" size={13} color={colors.textTertiary} style={{ marginTop: 2 }} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        
        {/* Categories Breakdown */}
        {categoryBreakdown.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Categories</Text>
            </View>
            <View style={styles.categoriesList}>
              {categoryBreakdown.map(cat => {
                const meta = getCategoryMeta(cat.category);
                return (
                  <TouchableOpacity 
                    key={cat.category} 
                    style={styles.catRow}
                    onPress={() => router.push(`/category/${encodeURIComponent(cat.category)}`)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.catIcon, { backgroundColor: meta.color + '15' }]}>
                      <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                    </View>
                    <View style={styles.catInfo}>
                      <View style={styles.catHeaderRow}>
                        <Text style={styles.catName} numberOfLines={1}>{cat.category}</Text>
                        <Text style={styles.catAmount}>{formatRupiah(cat.amount)}</Text>
                      </View>
                      <View style={styles.catProgressRow}>
                        <View style={styles.catBarTrack}>
                          <View style={[styles.catBarFill, { width: `${cat.percentage}%`, backgroundColor: meta.color }]} />
                        </View>
                        <Text style={styles.catPct}>{cat.percentage}%</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Forecast Section (Current month only) */}
        {isCurrentMonth && totalSpent > 0 && forecasts.length > 0 && (
          <View style={[styles.section, { marginTop: spacing.sm }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Forecast</Text>
            </View>
            <View style={styles.forecastCard}>
              <Text style={styles.forecastLabel}>Projected month-end spending</Text>
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
    paddingVertical: spacing.xs,
    height: 48,
  },
  headerSide: { flex: 1 },
  monthNav: { flex: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navArrow: { padding: spacing.xs },
  monthLabelBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  monthLabel: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: colors.textPrimary },
  
  reviewCardContainer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card
  },
  reviewTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
  reviewSub: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: colors.textSecondary },

  heroSection: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  heroEyebrow: { 
    fontFamily: 'Manrope_700Bold', 
    fontSize: 11, 
    color: colors.textTertiary, 
    letterSpacing: 1.2, 
    textTransform: 'uppercase',
    marginBottom: 8 
  },
  heroValue: { 
    ...typography.numberHero, 
    fontSize: 36, 
    letterSpacing: -0.5,
    marginBottom: 10 
  },
  heroMetaPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMetaText: { 
    fontFamily: 'Manrope_600SemiBold', 
    fontSize: 13, 
    color: colors.textSecondary 
  },
  heroPrevMuted: { 
    fontFamily: 'Manrope_500Medium', 
    fontSize: 13, 
    color: colors.textTertiary, 
    marginTop: 10 
  },

  insightSection: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  insightBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  insightIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  insightText: {
    flex: 1,
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 19,
  },

  section: {
    marginBottom: spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: radius.pill,
    padding: 3,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: colors.textTertiary,
  },
  segmentTextActive: {
    color: colors.textPrimary,
    fontFamily: 'Manrope_700Bold',
  },

  merchantsList: {
    paddingHorizontal: spacing.xl,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  merchantRank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  merchantRankText: { 
    fontFamily: 'Manrope_700Bold', 
    fontSize: 11, 
    color: colors.textSecondary 
  },
  merchantInfo: { 
    flex: 1, 
    marginRight: 12 
  },
  merchantName: { 
    fontFamily: 'Manrope_700Bold', 
    fontSize: 15, 
    color: colors.textPrimary,
    marginBottom: 2 
  },
  merchantSub: { 
    fontFamily: 'Manrope_500Medium', 
    fontSize: 12, 
    color: colors.textTertiary 
  },
  merchantRight: { 
    alignItems: 'center', 
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4
  },
  merchantAmount: { 
    fontFamily: 'Manrope_700Bold', 
    fontSize: 15, 
    color: colors.textPrimary 
  },

  categoriesList: {
    paddingHorizontal: spacing.xl,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  catIcon: {
    width: 36, 
    height: 36, 
    borderRadius: 10, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginRight: 12,
  },
  catInfo: { 
    flex: 1,
  },
  catHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  catName: { 
    fontFamily: 'Manrope_700Bold', 
    fontSize: 15, 
    color: colors.textPrimary 
  },
  catAmount: { 
    fontFamily: 'Manrope_700Bold', 
    fontSize: 15, 
    color: colors.textPrimary 
  },
  catProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  catBarTrack: { 
    flex: 1,
    height: 4, 
    backgroundColor: '#F1F5F9', 
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 10,
  },
  catBarFill: { 
    height: 4, 
    borderRadius: 2 
  },
  catPct: { 
    fontFamily: 'Manrope_600SemiBold', 
    fontSize: 12, 
    color: colors.textTertiary,
    minWidth: 32,
    textAlign: 'right',
  },

  forecastCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    ...shadow.card
  },
  forecastLabel: { 
    fontFamily: 'Manrope_600SemiBold', 
    fontSize: 10, 
    color: colors.textSecondary, 
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5 
  },
  forecastHero: { 
    fontFamily: 'Manrope_800ExtraBold', 
    fontSize: 24, 
    color: colors.primary 
  },
  
  pickerContainer: { 
    backgroundColor: '#FFF', 
    borderTopLeftRadius: 20, 
    borderTopRightRadius: 20, 
    maxHeight: '60%' 
  },
  pickerHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    padding: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#E5E7EB' 
  },
  pickerTitle: { 
    fontFamily: 'Manrope_700Bold', 
    fontSize: 16 
  },
  pickerItem: { 
    padding: 16, 
    borderBottomWidth: StyleSheet.hairlineWidth, 
    borderBottomColor: '#E5E7EB' 
  },
  pickerItemText: { 
    fontFamily: 'Manrope_500Medium', 
    fontSize: 15, 
    textAlign: 'center', 
    color: colors.textPrimary 
  }
});
