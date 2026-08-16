import { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  ActionSheetIOS,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { getAllReceipts, getAllItemSpend, deleteReceipt, ReceiptSummary, ItemSpendRecord } from '../../db/queries';
import { formatRupiah } from '../../lib/format';
import { CATEGORIES, getCategoryMeta } from '../../constants/categories';
import { DOCUMENT_TYPE_META } from '../../constants/documentTypes';
import { SourceType } from '../../types/receipt';
import { colors, spacing, radius } from '../../constants/theme';
import StateView from '../../components/StateView';

type DateFilter = 'thisMonth' | 'lastMonth' | 'allTime';

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'allTime', label: 'All Time' },
];

function getDateRange(filter: DateFilter): { start: Date; end: Date } | null {
  const now = new Date();
  if (filter === 'allTime') return null;
  if (filter === 'thisMonth') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  return {
    start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    end: new Date(now.getFullYear(), now.getMonth(), 1),
  };
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [itemSpend, setItemSpend] = useState<ItemSpendRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('thisMonth');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  async function loadData() {
    const [receiptData, spendData] = await Promise.all([getAllReceipts(db), getAllItemSpend(db)]);
    setReceipts(receiptData);
    setItemSpend(spendData);
  }

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      async function load() {
        const [receiptData, spendData] = await Promise.all([getAllReceipts(db), getAllItemSpend(db)]);
        if (isActive) {
          setReceipts(receiptData);
          setItemSpend(spendData);
          setIsLoading(false);
        }
      }
      load();
      return () => {
        isActive = false;
      };
    }, [db])
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }

  function handleDeletePress(id: string) {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Delete this transaction?',
        options: ['Delete', 'Cancel'],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      async (buttonIndex) => {
        if (buttonIndex === 0) {
          await deleteReceipt(db, id);
          loadData();
        }
      }
    );
  }

  const range = useMemo(() => getDateRange(dateFilter), [dateFilter]);

  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      const d = new Date(r.purchaseDate);
      const inRange = !range || (d >= range.start && d < range.end);
      const inCategory = categoryFilter === 'All' || r.categories.includes(categoryFilter);
      return inRange && inCategory;
    });
  }, [receipts, range, categoryFilter]);

  const summaryTotal = useMemo(() => {
    if (categoryFilter === 'All') {
      return filteredReceipts.reduce((sum, r) => sum + r.totalAmount, 0);
    }
    return itemSpend
      .filter((rec) => {
        const category = rec.category || 'Other';
        if (category !== categoryFilter) return false;
        const d = new Date(rec.purchaseDate);
        return !range || (d >= range.start && d < range.end);
      })
      .reduce((sum, rec) => sum + rec.amount, 0);
  }, [categoryFilter, filteredReceipts, itemSpend, range]);

  if (!isLoading && receipts.length === 0) {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
        <StateView
          icon="receipt-outline"
          title="No receipts yet"
          subtitle="Tap Scan to add your first one."
        />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <FlatList
        style={styles.flex}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 90 }]}
        data={filteredReceipts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.textPrimary} />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ paddingTop: Math.max(insets.top, 16) }}>
            {/* Header: Overview Title */}
            <View style={styles.headerSection}>
              <Text style={styles.headerTitle}>Overview</Text>
            </View>

            {/* Compact Spending Summary Card */}
            <View style={styles.summaryCardWrapper}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>
                  {categoryFilter === 'All' ? 'TOTAL SPEND' : `${categoryFilter.toUpperCase()} SPEND`}
                </Text>
                <Text style={styles.summaryAmount}>{formatRupiah(summaryTotal)}</Text>
                <Text style={styles.summarySubtext}>
                  {filteredReceipts.length} transaction{filteredReceipts.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            {/* Segmented Time-Period Filters */}
            <View style={styles.periodFilterContainer}>
              <View style={styles.periodSegmentWrapper}>
                {DATE_FILTERS.map((f) => {
                  const isSelected = dateFilter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.periodSegmentBtn, isSelected && styles.periodSegmentBtnActive]}
                      onPress={() => setDateFilter(f.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.periodSegmentText, isSelected && styles.periodSegmentTextActive]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Horizontal Scrollable Category Chips */}
            <View style={styles.categoryFilterContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryChipScroll}
              >
                {['All', ...CATEGORIES].map((category) => {
                  const isSelected = categoryFilter === category;
                  const meta = category !== 'All' ? getCategoryMeta(category) : null;
                  return (
                    <TouchableOpacity
                      key={category}
                      style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                      onPress={() => setCategoryFilter(category)}
                      activeOpacity={0.7}
                    >
                      {meta && (
                        <View
                          style={[
                            styles.categoryChipDot,
                            { backgroundColor: isSelected ? '#FFFFFF' : meta.color },
                          ]}
                        />
                      )}
                      <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextActive]}>
                        {category}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Section Header */}
            <View style={styles.transactionHeaderSection}>
              <Text style={styles.sectionTitle}>Transactions</Text>
              <Text style={styles.transactionCountBadge}>{filteredReceipts.length}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const primaryCategory = item.categories[0] || 'Other';
          const primaryMeta = getCategoryMeta(primaryCategory);
          const merchantDisplay = item.merchantName?.trim() || 'Shopping Receipt';
          const dateDisplay = formatDate(item.purchaseDate);

          return (
            <Swipeable
              renderRightActions={() => (
                <TouchableOpacity style={styles.swipeDeleteButton} onPress={() => handleDeletePress(item.id)}>
                  <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.swipeDeleteText}>Delete</Text>
                </TouchableOpacity>
              )}
            >
              <TouchableOpacity
                style={styles.transactionRow}
                onPress={() => router.push(`/receipt/${item.id}`)}
                activeOpacity={0.7}
              >
                {/* Standardized Icon Container */}
                <View style={[styles.iconContainer, { backgroundColor: primaryMeta.color + '15' }]}>
                  <Ionicons name={primaryMeta.icon as any} size={18} color={primaryMeta.color} />
                </View>

                {/* Left: Merchant and Date/Badge */}
                <View style={styles.transactionDetails}>
                  <Text style={styles.merchantName} numberOfLines={2}>
                    {merchantDisplay}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.dateText}>{dateDisplay}</Text>
                    <Text style={styles.metaSeparator}>·</Text>
                    <View style={[styles.categoryBadge, { backgroundColor: primaryMeta.color + '15' }]}>
                      <Text style={[styles.categoryBadgeText, { color: primaryMeta.color }]}>
                        {primaryCategory.toUpperCase()}
                      </Text>
                    </View>
                    {item.sourceType && item.sourceType !== 'receipt' && (
                      <>
                        <Text style={styles.metaSeparator}>·</Text>
                        <View style={[styles.categoryBadge, { backgroundColor: '#F1F5F9' }]}>
                          <Ionicons 
                            name={DOCUMENT_TYPE_META[item.sourceType as SourceType]?.icon || 'document-text-outline'} 
                            size={10} 
                            color="#64748B" 
                            style={{ marginRight: 2 }} 
                          />
                          <Text style={[styles.categoryBadgeText, { color: '#64748B' }]}>
                            {DOCUMENT_TYPE_META[item.sourceType as SourceType]?.label.toUpperCase() || 'DOCUMENT'}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>

                {/* Right: Amount & Chevron */}
                <View style={styles.transactionRight}>
                  <Text style={styles.amountText}>{formatRupiah(item.totalAmount)}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={styles.chevron} />
                </View>
              </TouchableOpacity>
            </Swipeable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyFilteredState}>
            <Ionicons name="filter-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyFilteredText}>No transactions found for this filter.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  listContent: {
    paddingBottom: 40,
  },
  headerSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 26,
    color: '#0F172A', // Dark Navy
    letterSpacing: -0.6,
  },
  summaryCardWrapper: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0', // Subtle light gray border
  },
  summaryLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    color: '#64748B', // Muted slate
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  summaryAmount: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 28,
    color: '#0F172A', // Dark Navy
    letterSpacing: -1,
    marginTop: 4,
    marginBottom: 4,
  },
  summarySubtext: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#94A3B8',
  },
  periodFilterContainer: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  periodSegmentWrapper: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: radius.sm,
    padding: 3,
  },
  periodSegmentBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
  },
  periodSegmentBtnActive: {
    backgroundColor: '#0F172A', // Dark Navy
  },
  periodSegmentText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#64748B',
  },
  periodSegmentTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
  },
  categoryFilterContainer: {
    marginBottom: spacing.md,
  },
  categoryChipScroll: {
    paddingHorizontal: spacing.md,
    paddingRight: spacing.lg,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    height: 32,
  },
  categoryChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  categoryChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  categoryChipText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#64748B',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
  },
  transactionHeaderSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  transactionCountBadge: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#94A3B8',
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
    marginRight: 8,
  },
  merchantName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: '#0F172A',
    lineHeight: 20,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#64748B',
  },
  metaSeparator: {
    marginHorizontal: 6,
    color: '#CBD5E1',
    fontSize: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
  },
  categoryBadgeText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  transactionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  amountText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: '#0F172A',
    letterSpacing: -0.3,
    textAlign: 'right',
  },
  chevron: {
    marginLeft: 6,
  },
  swipeDeleteButton: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 75,
  },
  swipeDeleteText: {
    fontFamily: 'Manrope_700Bold',
    color: '#FFFFFF',
    fontSize: 11,
    marginTop: 2,
  },
  emptyFilteredState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyFilteredText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#94A3B8',
  },
});
