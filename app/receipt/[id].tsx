import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, StatusBar } from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getReceiptDetail, ReceiptDetail } from '../../db/queries';
import { formatRupiah, toTitleCase } from '../../lib/format';
import { getCategoryMeta } from '../../constants/categories';
import { DOCUMENT_TYPE_META } from '../../constants/documentTypes';
import { SourceType } from '../../types/receipt';
import { colors, spacing, radius } from '../../constants/theme';
import StateView from '../../components/StateView';

export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      async function load() {
        if (!id) return;
        try {
          setHasError(false);
          const data = await getReceiptDetail(db, id);
          if (isActive) {
            setReceipt(data);
            setIsLoading(false);
          }
        } catch (err) {
          console.error('[ReceiptDetailScreen] load error:', err);
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
    }, [db, id])
  );

  if (hasError) {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
        <StateView
          icon="alert-circle-outline"
          iconTone="error"
          title="Could not load data"
          subtitle="Something went wrong. Pull to refresh or restart the app."
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#0F172A" />
      </View>
    );
  }

  if (!receipt) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>Transaction not found.</Text>
      </View>
    );
  }

  const merchantDisplay = receipt.merchantName?.trim() || 'Shopping Receipt';

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <Stack.Screen
        options={{
          title: formatDate(receipt.purchaseDate),
          headerBackTitle: 'Back',
          headerTitleStyle: {
            fontFamily: 'Manrope_700Bold',
            fontSize: 16,
            color: '#0F172A',
          },
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/confirm', params: { receiptId: receipt.id } })}
              style={styles.editBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={receipt.items}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            {/* Merchant Info Hero */}
            <View style={styles.merchantCard}>
              <View style={styles.merchantIconCircle}>
                <Ionicons name="storefront-outline" size={20} color="#0F172A" />
              </View>
              <View style={styles.merchantTextGroup}>
                <Text style={styles.merchantTitle} numberOfLines={2}>
                  {merchantDisplay}
                </Text>
                <View style={styles.merchantDateRow}>
                  <Text style={styles.merchantDate}>{formatFullDate(receipt.purchaseDate)}</Text>
                  {receipt.sourceType && receipt.sourceType !== 'receipt' && (
                    <View style={[styles.sourceBadge, { backgroundColor: '#F1F5F9' }]}>
                      <Ionicons 
                        name={DOCUMENT_TYPE_META[receipt.sourceType as SourceType]?.icon || 'document-text-outline'} 
                        size={10} 
                        color="#64748B" 
                        style={{ marginRight: 2 }} 
                      />
                      <Text style={styles.sourceBadgeText}>
                        {DOCUMENT_TYPE_META[receipt.sourceType as SourceType]?.label.toUpperCase() || 'DOCUMENT'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Items ({receipt.items.length})</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const catMeta = getCategoryMeta(item.category || 'Other');
          const isFirst = index === 0;
          const isLast = index === receipt.items.length - 1;

          return (
            <View
              style={[
                styles.itemRow,
                isFirst && styles.itemRowFirst,
                isLast && styles.itemRowLast,
                !isLast && styles.itemRowDivider,
              ]}
            >
              <View style={styles.itemLeft}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {toTitleCase(item.name)}
                </Text>
                <View style={styles.itemMetaRow}>
                  <View style={[styles.categoryBadge, { backgroundColor: catMeta.color + '15' }]}>
                    <Text style={[styles.categoryBadgeText, { color: catMeta.color }]}>
                      {(item.category || 'Other').toUpperCase()}
                    </Text>
                  </View>
                  {item.quantity > 1 && (
                    <Text style={styles.quantityText}>
                      {item.quantity} × {formatRupiah(item.price)}
                    </Text>
                  )}
                </View>
              </View>
              <Text style={styles.itemPriceText}>{formatRupiah(item.price * item.quantity)}</Text>
            </View>
          );
        }}
        ListFooterComponent={
          <View style={styles.footerContainer}>
            <View style={styles.summaryCard}>
              {receipt.tax > 0 && (
                <View style={styles.chargeRow}>
                  <Text style={styles.chargeLabel}>Tax (Pajak / PB1)</Text>
                  <Text style={styles.chargeValue}>{formatRupiah(receipt.tax)}</Text>
                </View>
              )}
              {receipt.serviceCharge > 0 && (
                <View style={styles.chargeRow}>
                  <Text style={styles.chargeLabel}>Service Charge</Text>
                  <Text style={styles.chargeValue}>{formatRupiah(receipt.serviceCharge)}</Text>
                </View>
              )}
              <View
                style={[
                  styles.totalRow,
                  !(receipt.tax > 0 || receipt.serviceCharge > 0) && {
                    borderTopWidth: 0,
                    marginTop: 0,
                    paddingTop: 0,
                  },
                ]}
              >
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatRupiah(receipt.totalAmount)}</Text>
              </View>
            </View>
          </View>
        }
      />
    </View>
  );
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
}

function formatFullDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  notFoundText: {
    fontFamily: 'Manrope_600SemiBold',
    color: '#64748B',
    fontSize: 14,
  },
  editBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    backgroundColor: '#0F172A',
    borderRadius: radius.pill,
  },
  editBtnText: {
    fontFamily: 'Manrope_700Bold',
    color: '#FFFFFF',
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: 40,
  },
  headerSection: {
    marginBottom: spacing.xs + 2,
  },
  merchantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  merchantIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  merchantTextGroup: {
    flex: 1,
  },
  merchantTitle: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 17,
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  merchantDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  merchantDate: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#64748B',
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  sourceBadgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    color: '#64748B',
    letterSpacing: 0.4,
  },
  sectionTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#0F172A',
    marginBottom: spacing.xs + 2,
    letterSpacing: -0.2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderColor: '#E2E8F0',
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  itemRowFirst: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderTopWidth: 1,
  },
  itemRowLast: {
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    borderBottomWidth: 1,
  },
  itemRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemLeft: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: '#0F172A',
    lineHeight: 20,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  categoryBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  categoryBadgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  quantityText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#64748B',
  },
  itemPriceText: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 15,
    color: '#0F172A',
    letterSpacing: -0.3,
    textAlign: 'right',
  },
  footerContainer: {
    marginTop: spacing.md,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chargeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  chargeLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#64748B',
  },
  chargeValue: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#0F172A',
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 6,
  },
  totalLabel: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 16,
    color: '#0F172A',
  },
  totalValue: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 18,
    color: '#0F172A',
    letterSpacing: -0.5,
    textAlign: 'right',
  },
});
