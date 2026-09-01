import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { getMerchantSummary, getMerchantTransactions, ReceiptSummary, getMonthlyItemSpend } from '../../db/queries';
import { colors, typography, spacing, shadow } from '../../constants/theme';
import { formatRupiah, normalizeMerchantName } from '../../lib/format';
import TransactionCard from '../../components/TransactionCard';

export default function MerchantDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const { name, start } = useLocalSearchParams<{ name: string; start: string }>();

  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState({ totalAmount: 0, visitCount: 0 });
  const [transactions, setTransactions] = useState<ReceiptSummary[]>([]);
  const [monthTotal, setMonthTotal] = useState(0);

  const loadData = useCallback(async () => {
    if (!name || !start) return;
    setIsLoading(true);
    try {
      const startDate = new Date(start);
      const end = new Date(startDate);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);

      const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}T23:59:59.999Z`;

      const merchantSum = await getMerchantSummary(db, name, startStr, endStr);
      setSummary(merchantSum);

      const txs = await getMerchantTransactions(db, name, startStr, endStr);
      // Filter exactly to this merchant to be safe
      const filtered = txs.filter(t => normalizeMerchantName(t.merchantName).toLowerCase() === normalizeMerchantName(name).toLowerCase());
      setTransactions(filtered);

      const spends = await getMonthlyItemSpend(db, startStr, endStr);
      setMonthTotal(spends.reduce((sum, s) => sum + s.amount, 0));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [db, name, start]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const avg = summary.visitCount > 0 ? summary.totalAmount / summary.visitCount : 0;
  const pct = monthTotal > 0 ? Math.round((summary.totalAmount / monthTotal) * 100) : 0;
  const merchantLabel = name ? normalizeMerchantName(name) : 'Merchant';

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{top:10, bottom:10, left:10, right:10}}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{merchantLabel}</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.heroSection}>
              <Text style={styles.heroValue}>{formatRupiah(summary.totalAmount)}</Text>
              <Text style={styles.heroSub}>{summary.visitCount} transaction{summary.visitCount !== 1 ? 's' : ''}</Text>
              
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Average</Text>
                  <Text style={styles.statVal}>{formatRupiah(avg)}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>% of month</Text>
                  <Text style={styles.statVal}>{pct}%</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Transactions</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TransactionCard
              id={item.id}
              merchantName={normalizeMerchantName(item.merchantName)}
              dateDisplay={new Date(item.purchaseDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()}
              primaryCategory={item.categories[0] || 'Other'}
              totalAmount={item.totalAmount}
              onPress={() => router.push(`/receipt/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FAFAFA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: '#FAFAFA',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 80 },
  backText: { fontFamily: 'Manrope_600SemiBold', fontSize: 16, color: colors.textPrimary, marginLeft: -4 },
  headerTitle: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 16, textAlign: 'center', color: colors.textPrimary },
  
  heroSection: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  heroValue: { ...typography.numberHero, fontSize: 32, marginBottom: 4 },
  heroSub: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: colors.textSecondary },
  
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: colors.textTertiary, marginBottom: 4 },
  statVal: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.textPrimary },

  sectionTitle: { ...typography.h3, alignSelf: 'flex-start', marginBottom: spacing.md }
});
