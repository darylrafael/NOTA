import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { 
  getMonthlyItemSpend, 
  getTopMerchants, 
  getBiggestExpenses,
  TopMerchant, 
  ReceiptSummary, 
  ItemSpendRecord 
} from '../../db/queries';
import { colors, typography, spacing, radius, shadow } from '../../constants/theme';
import { formatRupiah, normalizeMerchantName } from '../../lib/format';
import { getCategoryMeta } from '../../constants/categories';

export default function MonthlyReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const scrollRef = useRef<ScrollView>(null);



  const { month } = useLocalSearchParams<{ month: string }>(); // Expecting ISO string or YYYY-MM
    useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ y: 0, animated: false });
    }
  }, [month]);

  const [isLoading, setIsLoading] = useState(true);
  const [itemSpends, setItemSpends] = useState<ItemSpendRecord[]>([]);
  const [topMerchantsSpend, setTopMerchantsSpend] = useState<TopMerchant[]>([]);
  const [topMerchantsFreq, setTopMerchantsFreq] = useState<TopMerchant[]>([]);
  const [biggestExpenses, setBiggestExpenses] = useState<ReceiptSummary[]>([]);
  const [prevMonthTotal, setPrevMonthTotal] = useState(0);

  const parsedDate = useMemo(() => {
    if (!month) return new Date();
    return new Date(month);
  }, [month]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const start = new Date(parsedDate);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);

      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}T23:59:59.999Z`;

      const spends = await getMonthlyItemSpend(db, startStr, endStr);
      setItemSpends(spends);

      const bySpend = await getTopMerchants(db, startStr, endStr, 'spending');
      setTopMerchantsSpend(bySpend);

      const byFreq = await getTopMerchants(db, startStr, endStr, 'frequency');
      setTopMerchantsFreq(byFreq);

      const bigExps = await getBiggestExpenses(db, startStr, endStr, 1);
      setBiggestExpenses(bigExps);

      const prevStart = new Date(start);
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
  }, [db, parsedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const monthLabel = parsedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  const prevMonthLabel = useMemo(() => {
    const p = new Date(parsedDate);
    p.setMonth(p.getMonth() - 1);
    return p.toLocaleDateString('en-US', { month: 'long' });
  }, [parsedDate]);

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
    
    if (pct > 999 || prevMonthTotal < 50000) {
       return `${arrow} ${formatRupiah(Math.abs(diff))} vs ${prevMonthLabel}`;
    }
    
    return `${arrow} ${formatRupiah(Math.abs(diff))} (${pct.toLocaleString('en-US')}%) vs ${prevMonthLabel}`;
  };

  const topCategory = categoryBreakdown[0];
  const topMerchantSpend = topMerchantsSpend[0];
  const topMerchantFreq = topMerchantsFreq[0];
  const biggestExpense = biggestExpenses[0];

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} hitSlop={{top:15, bottom:15, left:15, right:15}}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingHorizontal: spacing.xl }} showsVerticalScrollIndicator={false}>
          
          <View style={styles.heroSection}>
            <Text style={styles.heroPretitle}>{monthLabel}</Text>
            <Text style={styles.heroTitle}>Your month in review</Text>
            
            <View style={{ height: spacing.xl }} />
            
            <Text style={styles.heroValue}>{formatRupiah(totalSpent)}</Text>
            <Text style={styles.heroSubMuted}>Total Spent</Text>
            
            {getMoMText() !== '' && (
              <View style={styles.momBadge}>
                <Text style={styles.momText}>{getMoMText()}</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

            {topCategory && (
              <View style={styles.insightBlock}>
                <Text style={styles.insightLabel}>TOP CATEGORY</Text>
                <Text style={styles.insightValue}>{topCategory.category}</Text>
                <Text style={styles.insightSub}>{formatRupiah(topCategory.amount)} ({topCategory.percentage}% of total)</Text>
              </View>
            )}

          {topMerchantSpend && (
            <TouchableOpacity style={styles.insightBlock} onPress={() => router.push(`/merchant/${encodeURIComponent(topMerchantSpend.merchantName)}?start=${parsedDate.toISOString()}`)} activeOpacity={0.7}>
              <Text style={styles.insightLabel}>TOP MERCHANT</Text>
              <Text style={styles.insightValue}>{normalizeMerchantName(topMerchantSpend.merchantName)}</Text>
              <Text style={styles.insightSub}>{formatRupiah(topMerchantSpend.totalAmount)}</Text>
            </TouchableOpacity>
          )}

          {topMerchantFreq && (
            <TouchableOpacity style={styles.insightBlock} onPress={() => router.push(`/merchant/${encodeURIComponent(topMerchantFreq.merchantName)}?start=${parsedDate.toISOString()}`)} activeOpacity={0.7}>
              <Text style={styles.insightLabel}>MOST FREQUENT</Text>
              <Text style={styles.insightValue}>{normalizeMerchantName(topMerchantFreq.merchantName)}</Text>
              <Text style={styles.insightSub}>{topMerchantFreq.visitCount} transactions</Text>
            </TouchableOpacity>
          )}

          {biggestExpense && (
            <TouchableOpacity style={styles.insightBlock} onPress={() => router.push(`/receipt/${biggestExpense.id}`)} activeOpacity={0.7}>
              <Text style={styles.insightLabel}>BIGGEST EXPENSE</Text>
              <Text style={styles.insightValue}>{normalizeMerchantName(biggestExpense.merchantName)}</Text>
              <Text style={styles.insightSub}>{formatRupiah(biggestExpense.totalAmount)}</Text>
            </TouchableOpacity>
          )}

          <View style={[styles.divider, { marginTop: spacing.lg }]} />

          <View style={styles.catSection}>
            <Text style={styles.catSectionTitle}>CATEGORY BREAKDOWN</Text>
            {categoryBreakdown.map(cat => (
              <View key={cat.category} style={styles.catRow}>
                <Text style={styles.catName}>{cat.category}</Text>
                <Text style={styles.catMeta}>{formatRupiah(cat.amount)} {'\u2022'} {cat.percentage}%</Text>
              </View>
            ))}
          </View>

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroSection: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  heroPretitle: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.textTertiary, letterSpacing: 1, marginBottom: 6 },
  heroTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 32, color: colors.textPrimary, lineHeight: 38 },
  
  heroValue: { ...typography.numberHero, fontSize: 32, color: colors.textPrimary, marginBottom: 4 },
  heroSubMuted: { fontFamily: 'Manrope_500Medium', fontSize: 15, color: colors.textTertiary, marginBottom: 16 },
  
  momBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  momText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: colors.textSecondary },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: spacing.xl,
  },

  insightBlock: {
    marginBottom: spacing.xl,
  },
  insightLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  insightValue: { fontFamily: 'Manrope_700Bold', fontSize: 20, color: colors.textPrimary, marginBottom: 4 },
  insightSub: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: colors.textSecondary },

  catSection: {
    marginTop: spacing.md,
  },
  catSectionTitle: {
    fontFamily: 'Manrope_700Bold', fontSize: 11, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16
  },
  catRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  catName: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: colors.textPrimary },
  catMeta: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: colors.textSecondary },
});
