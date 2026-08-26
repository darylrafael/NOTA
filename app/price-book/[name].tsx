import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getPriceBookItemHistory } from '../../db/queries';
import { PriceBookTransaction } from '../../types/receipt';
import { formatRupiah, toTitleCase } from '../../lib/format';
import { formatPurchaseDateLong } from '../../lib/date';
import { colors, spacing, radius } from '../../constants/theme';

export default function PriceBookDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const [history, setHistory] = useState<PriceBookTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    if (!name) return;
    try {
      const data = await getPriceBookItemHistory(db, name);
      setHistory(data);
    } catch (e) {
      console.error('Failed to load price book history', e);
    } finally {
      setIsLoading(false);
    }
  }, [db, name]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const renderTransaction = ({ item }: { item: PriceBookTransaction }) => {
    return (
      <TouchableOpacity 
        style={styles.historyCard}
        activeOpacity={0.7}
        onPress={() => router.push(`/receipt/${item.receiptId}`)}
      >
        <View style={styles.historyRow}>
          <View style={styles.historyLeft}>
            <Text style={styles.historyMerchant} numberOfLines={1}>{item.merchantName || 'Unknown Store'}</Text>
            <Text style={styles.historyDate}>{formatPurchaseDateLong(item.purchaseDate)}</Text>
          </View>
          <View style={styles.historyRight}>
            <Text style={styles.historyPrice}>{formatRupiah(item.unitPrice)}</Text>
            <Text style={styles.historyQty}>{item.quantity} {item.quantity === 1 ? 'unit' : 'units'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.border} style={{ marginLeft: spacing.sm }} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: toTitleCase(name || 'Item History') }} />
      
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item, idx) => `${item.receiptId}-${idx}`}
          renderItem={renderTransaction}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            history.length > 0 ? (
              <View style={styles.headerSummary}>
                <Text style={styles.summaryTitle}>Purchase History</Text>
                <Text style={styles.summarySubtitle}>
                  You've bought this {history.length} {history.length === 1 ? 'time' : 'times'}.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="time-outline" size={48} color={colors.border} />
              <Text style={styles.emptyTitle}>No history found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerSummary: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  summaryTitle: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  summarySubtitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: colors.textSecondary,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  historyMerchant: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  historyDate: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  historyRight: {
    alignItems: 'flex-end',
  },
  historyPrice: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  historyQty: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    marginTop: spacing.xl,
  },
  emptyTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: spacing.md,
  }
});
