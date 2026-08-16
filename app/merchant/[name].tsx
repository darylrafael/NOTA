import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, StatusBar, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useFocusEffect, Stack, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getMerchantReceipts, MerchantReceiptDetail } from '../../db/queries';
import { formatRupiah, toTitleCase } from '../../lib/format';
import { getCategoryMeta } from '../../constants/categories';
import { colors, spacing, radius } from '../../constants/theme';

export default function MerchantDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [receipts, setReceipts] = useState<MerchantReceiptDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const merchantName = name ? decodeURIComponent(name) : 'Store Details';

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      async function load() {
        if (!name) return;
        const data = await getMerchantReceipts(db, merchantName);
        if (isActive) {
          setReceipts(data);
          setIsLoading(false);
        }
      }
      load();
      return () => {
        isActive = false;
      };
    }, [db, name, merchantName])
  );

  const totalSpent = receipts.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalItemsCount = receipts.reduce((sum, r) => sum + r.items.length, 0);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#0F172A" />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <Stack.Screen 
        options={{ 
          title: merchantName,
          headerBackTitle: 'Back',
          headerTitleStyle: {
            fontFamily: 'Manrope_700Bold',
            fontSize: 16,
            color: '#0F172A',
          },
        }} 
      />

      <FlatList
        contentContainerStyle={styles.listContent}
        data={receipts}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            {/* Merchant Summary Hero */}
            <View style={styles.heroCard}>
              <View style={styles.storeIconWrapper}>
                <Ionicons name="storefront" size={24} color="#0F172A" />
              </View>
              <Text style={styles.heroMerchantName}>{merchantName}</Text>
              <Text style={styles.heroTotalAmount}>{formatRupiah(totalSpent)}</Text>
              <Text style={styles.heroSubtext}>
                {receipts.length} visit{receipts.length === 1 ? '' : 's'} · {totalItemsCount} items purchased
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Transaction History</Text>
          </View>
        }
        renderItem={({ item }) => {
          const dateStr = formatFullDate(item.purchaseDate);

          return (
            <TouchableOpacity 
              style={styles.receiptCard}
              onPress={() => router.push(`/receipt/${item.id}`)}
              activeOpacity={0.7}
            >
              {/* Receipt Header: Date & Total */}
              <View style={styles.receiptHeader}>
                <View style={styles.dateGroup}>
                  <Ionicons name="calendar-outline" size={14} color="#64748B" />
                  <Text style={styles.receiptDate}>{dateStr}</Text>
                </View>
                <Text style={styles.receiptTotal}>{formatRupiah(item.totalAmount)}</Text>
              </View>

              {/* Items Purchased on this visit */}
              <View style={styles.itemsListContainer}>
                {item.items.map((it, idx) => {
                  const catMeta = getCategoryMeta(it.category || 'Other');
                  const isLastItem = idx === item.items.length - 1;
                  return (
                    <View 
                      key={it.id} 
                      style={[styles.itemRow, !isLastItem && styles.itemRowDivider]}
                    >
                      <View style={styles.itemLeft}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {toTitleCase(it.name)}
                        </Text>
                        <View style={styles.itemMetaRow}>
                          <View style={[styles.catBadge, { backgroundColor: catMeta.color + '15' }]}>
                            <Text style={[styles.catBadgeText, { color: catMeta.color }]}>
                              {(it.category || 'Other').toUpperCase()}
                            </Text>
                          </View>
                          {it.quantity > 1 && (
                            <Text style={styles.qtyText}>
                              {it.quantity} × {formatRupiah(it.price)}
                            </Text>
                          )}
                        </View>
                      </View>
                      <Text style={styles.itemPrice}>{formatRupiah(it.price * it.quantity)}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Tax & Service Charge indicator if present */}
              {(item.tax > 0 || item.serviceCharge > 0) && (
                <View style={styles.taxServiceRow}>
                  <Text style={styles.taxServiceText}>
                    Incl. {item.tax > 0 ? `Tax (${formatRupiah(item.tax)})` : ''}
                    {item.tax > 0 && item.serviceCharge > 0 ? ' + ' : ''}
                    {item.serviceCharge > 0 ? `Service (${formatRupiah(item.serviceCharge)})` : ''}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No transaction records found for this merchant.</Text>
          </View>
        }
      />
    </View>
  );
}

function formatFullDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FAFAFA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA' },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { fontFamily: 'Manrope_600SemiBold', color: '#64748B', fontSize: 14 },
  listContent: { 
    paddingHorizontal: spacing.md, 
    paddingTop: spacing.xs,
    paddingBottom: 40 
  },
  headerSection: {
    marginBottom: spacing.sm,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  storeIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroMerchantName: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 18,
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  heroTotalAmount: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 28,
    color: '#0F172A',
    letterSpacing: -0.8,
    marginTop: 4,
    marginBottom: 2,
  },
  heroSubtext: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#94A3B8',
  },
  sectionTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#0F172A',
    marginBottom: spacing.xs + 2,
    letterSpacing: -0.2,
  },
  receiptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm + 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  receiptDate: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: '#0F172A',
  },
  receiptTotal: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 15,
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  itemsListContainer: {
    paddingTop: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  itemRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  itemLeft: {
    flex: 1,
    marginRight: 10,
  },
  itemName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#0F172A',
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  catBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  catBadgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
    letterSpacing: 0.4,
  },
  qtyText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: '#64748B',
  },
  itemPrice: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#0F172A',
    textAlign: 'right',
  },
  taxServiceRow: {
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    marginTop: 2,
  },
  taxServiceText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: '#94A3B8',
  },
});
