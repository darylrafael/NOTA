import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, StatusBar, Image, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useFocusEffect, useRouter, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getReceiptDetail, ReceiptDetail } from '../../db/queries';
import { formatRupiah, toTitleCase } from '../../lib/format';
import { formatPurchaseDateLong, formatPurchaseDateShort } from '../../lib/date';
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
  const [retryToken, setRetryToken] = useState(0);
  const [isViewerVisible, setIsViewerVisible] = useState(false);

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
    }, [db, id, retryToken])
  );

  if (hasError) {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
        <StateView
          icon="alert-circle-outline"
          iconTone="error"
          title="Could not load data"
          subtitle="Something went wrong. Please try again."
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
  
  const primaryCategory = Object.entries(
    receipt.items.reduce((acc, item) => {
      const cat = item.category || 'Other';
      acc[cat] = (acc[cat] || 0) + item.lineTotal;
      return acc;
    }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other';
  
  const primaryMeta = getCategoryMeta(primaryCategory);

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <Stack.Screen
        options={{
          title: '', // Minimalist header
          headerBackTitle: 'Back',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#FAFAFA' },
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
            {/* Clear Hierarchy: Merchant, Amount, Category, Date */}
            <View style={styles.heroSection}>
              <Text style={styles.heroMerchant} numberOfLines={2}>{merchantDisplay}</Text>
              <Text style={styles.heroAmount}>{formatRupiah(receipt.totalAmount)}</Text>
              
              <View style={styles.heroMetaRow}>
                <View style={[styles.heroCategoryBadge, { backgroundColor: primaryMeta.color + '15' }]}>
                  <Ionicons name={primaryMeta.icon as any} size={14} color={primaryMeta.color} />
                  <Text style={[styles.heroCategoryText, { color: primaryMeta.color }]}>
                    {primaryCategory.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.heroDate}>{formatPurchaseDateLong(receipt.purchaseDate)}</Text>
                
                {!!receipt.sourceType && receipt.sourceType !== 'receipt' && (
                  <>
                    <Text style={{ color: '#94A3B8', fontSize: 12 }}>·</Text>
                    <View style={styles.heroSourceBadge}>
                      <Ionicons 
                        name={DOCUMENT_TYPE_META[receipt.sourceType as SourceType]?.icon || 'document-text-outline'} 
                        size={10} 
                        color="#64748B" 
                        style={{ marginRight: 2 }} 
                      />
                      <Text style={styles.heroSourceBadgeText}>
                        {DOCUMENT_TYPE_META[receipt.sourceType as SourceType]?.label.toUpperCase() || 'DOCUMENT'}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {receipt.isSharedExpense && receipt.originalReceiptData ? (
                <View style={styles.sharedExpenseBanner}>
                  <Ionicons name="pie-chart" size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sharedExpenseTitle}>Shared Expense</Text>
                    <Text style={styles.sharedExpenseText}>
                      Original receipt was {formatRupiah(JSON.parse(receipt.originalReceiptData).totalAmount)}
                    </Text>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: '/split/[id]', params: { id: receipt.id } })}
                  style={styles.splitBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="people" size={16} color={colors.primary} />
                  <Text style={styles.splitBtnText}>Split Bill</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.sectionTitle}>Transaction Details</Text>
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
              <Text style={styles.itemPriceText}>{formatRupiah(item.lineTotal)}</Text>
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
              {receipt.discount > 0 && (
                <View style={styles.chargeRow}>
                  <Text style={styles.chargeLabel}>Discount</Text>
                  <Text style={styles.chargeValue}>-{formatRupiah(receipt.discount)}</Text>
                </View>
              )}
              <View
                style={[
                  styles.totalRow,
                  !(receipt.tax > 0 || receipt.serviceCharge > 0 || receipt.discount > 0) && {
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

            {receipt.imageUri && (
              <View style={styles.imageCard}>
                <Text style={styles.sectionLabel}>ORIGINAL RECEIPT</Text>
                <TouchableOpacity 
                  style={styles.imageWrapper} 
                  onPress={() => setIsViewerVisible(true)}
                  activeOpacity={0.8}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="View full receipt image"
                >
                  <Image 
                    source={{ uri: receipt.imageUri }} 
                    style={styles.receiptImage} 
                    resizeMode="cover" 
                  />
                  <View style={styles.expandOverlay}>
                    <Ionicons name="expand-outline" size={24} color="#FFF" />
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
      />

      <Modal visible={isViewerVisible} transparent={false} animationType="fade" onRequestClose={() => setIsViewerVisible(false)}>
        <SafeAreaView style={styles.viewerContainer}>
          <StatusBar barStyle="light-content" />
          <View style={styles.viewerHeader}>
            <TouchableOpacity 
              onPress={() => setIsViewerVisible(false)}
              style={styles.viewerCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="Close receipt viewer"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.viewerScroll}
            contentContainerStyle={styles.viewerScrollContent}
            maximumZoomScale={4}
            minimumZoomScale={1}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image 
              source={{ uri: receipt?.imageUri || '' }} 
              style={styles.viewerImage} 
              resizeMode="contain" 
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
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
  heroSection: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  heroMerchant: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 4,
  },
  heroAmount: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 36,
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -1,
    marginBottom: spacing.md,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroCategoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  heroCategoryText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  heroDate: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#64748B',
  },
  heroSourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroSourceBadgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    color: '#64748B',
    letterSpacing: 0.4,
  },
  splitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  splitBtnText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: colors.primary,
  },
  sharedExpenseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: radius.md,
    marginTop: spacing.md,
    gap: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  sharedExpenseTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: '#1E3A8A',
    marginBottom: 2,
  },
  sharedExpenseText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 12,
    color: '#1E3A8A',
  },
  sectionTitle: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 13,
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
  sectionLabel: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 12,
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  imageCard: {
    marginTop: spacing.xl,
  },
  imageWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    height: 400,
  },
  receiptImage: {
    width: '100%',
    height: '100%',
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
  expandOverlay: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: radius.pill,
    padding: 6,
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.md,
    zIndex: 10,
  },
  viewerCloseBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.pill,
    padding: 4,
  },
  viewerScroll: {
    flex: 1,
  },
  viewerScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
});
