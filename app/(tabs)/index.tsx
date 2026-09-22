import { useCallback, useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Alert,
  StatusBar,
  TextInput,
  ActionSheetIOS,
  Platform,
  LayoutAnimation,
  UIManager,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { getAllReceipts, getAllItemSpend, deleteReceipt, getTotalReceiptCount, getReceiptsNeedingReview, getUpcomingBillsThisMonth, ReceiptSummary, ItemSpendRecord } from '../../db/queries';
import { UpcomingBill } from '../../types/receipt';
import { formatRupiah, normalizeMerchantName } from '../../lib/format';
import { formatPurchaseDate, currentMonthRange, previousMonthRange, isInRange, parsePurchaseDate } from '../../lib/date';
import { CATEGORIES, getCategoryMeta } from '../../constants/categories';
import { DOCUMENT_TYPE_META } from '../../constants/documentTypes';
import { SourceType } from '../../types/receipt';
import { colors, spacing, radius, shadow, typography } from '../../constants/theme';
import { getTopSpendingCategory } from '../../lib/forecast';
import StateView from '../../components/StateView';
import AnimatedNumber from '../../components/AnimatedNumber';
import TransactionCard from '../../components/TransactionCard';
import BottomSheet from '../../components/BottomSheet';
import * as Haptics from 'expo-haptics';
import WeeklyPulseCard from '../../components/WeeklyPulseCard';
import { generateWeeklyPulse, WeeklyPulseData } from '../../lib/weeklyPulse';

type DateFilter = 'thisMonth' | 'lastMonth' | 'allTime';

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'allTime', label: 'All Time' },
];

function getDateRange(filter: DateFilter): { start: string; end: string } | null {
  if (filter === 'allTime') return null;
  if (filter === 'thisMonth') return currentMonthRange();
  return previousMonthRange();
}

function formatDate(value: string): string {
  return formatPurchaseDate(value);
}

function CategoryChip({
  category,
  isSelected,
  meta,
  onPress,
}: {
  category: string;
  isSelected: boolean;
  meta: any;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.categoryChip,
        isSelected && styles.categoryChipActive,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {meta && (
        <View
          style={[
            styles.categoryChipDot,
            { backgroundColor: isSelected ? colors.textOnPrimary : (meta?.color || colors.surface) },
          ]}
        />
      )}
      <Text
        style={[
          styles.categoryChipText,
          isSelected && styles.categoryChipTextActive,
        ]}
      >
        {category}
      </Text>
    </TouchableOpacity>
  );
}



function ExpandableBillRow({ bill }: { bill: UpcomingBill }) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const d = new Date(bill.dueDate);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = !isNaN(d.getTime()) ? `${months[d.getMonth()]} ${d.getDate()}` : '';

  const today = new Date();
  today.setHours(0,0,0,0);
  const isOverdue = !bill.isPaid && d.getTime() < today.getTime();
  const isToday = !bill.isPaid && d.getTime() === today.getTime();

  return (
    <Pressable 
      onPress={bill.isPaid ? undefined : handleToggle}
      style={({ pressed }) => [{
        backgroundColor: colors.surface, 
        borderRadius: radius.md, 
        borderWidth: 1, 
        borderColor: colors.border,
        padding: spacing.md,
        overflow: 'hidden',
      }, pressed && !bill.isPaid && { opacity: 0.8 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: bill.isPaid ? colors.border : colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
            <Ionicons name={getCategoryMeta(bill.rule.category).icon as any} size={18} color={bill.isPaid ? colors.textSecondary : colors.primary} />
          </View>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 15, color: colors.textPrimary }} numberOfLines={1}>{normalizeMerchantName(bill.rule.name)}</Text>
            <Text style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: bill.isPaid ? colors.success : isOverdue ? colors.error : isToday ? colors.warning : colors.textSecondary, marginTop: 2 }}>
                {(() => {
                  if (bill.isPaid) return 'PAID';
                  const dDate = new Date(bill.dueDate);
                  const todayDate = new Date();
                  todayDate.setHours(0,0,0,0);
                  dDate.setHours(0,0,0,0);
                  const diff = Math.ceil((dDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
                  if (diff < 0) return 'OVERDUE';
                  if (diff === 0) return 'DUE TODAY';
                  return `DUE IN ${diff} DAYS`;
                })()}
              </Text>
          </View>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 15, color: colors.textPrimary }}>{formatRupiah(bill.rule.amount)}</Text>
          {bill.isPaid ? (
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.success + '20', borderRadius: radius.pill, marginTop: 4 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Manrope_700Bold', color: colors.success }}>PAID</Text>
            </View>
          ) : isOverdue ? (
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.error + '20', borderRadius: radius.pill, marginTop: 4 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Manrope_700Bold', color: colors.error }}>OVERDUE</Text>
            </View>
          ) : isToday ? (
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.warning + '20', borderRadius: radius.pill, marginTop: 4 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Manrope_700Bold', color: colors.warning }}>DUE TODAY</Text>
            </View>
          ) : (
             <View style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.warning + '20', borderRadius: radius.pill, marginTop: 4 }}>
               <Text style={{ fontSize: 10, fontFamily: 'Manrope_700Bold', color: colors.warning }}>UPCOMING</Text>
             </View>
          )}
        </View>
      </View>

      {expanded && !bill.isPaid && (
        <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
          <TouchableOpacity 
            style={{ backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.pill, alignItems: 'center' }}
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({
                pathname: '/confirm',
                params: {
                  fromRecurring: bill.rule.name,
                  recurringDueDate: bill.dueDate,
                  recurringRuleId: bill.rule.id,
                  merchantName: bill.rule.name,
                  receiptTotal: String(bill.rule.amount),
                  tax: '0',
                  serviceCharge: '0',
                  discount: '0',
                  sourceType: 'receipt',
                  purchaseDate: new Date().toISOString(),
                  items: JSON.stringify([{
                    name: bill.rule.name,
                    quantity: 1,
                    price: bill.rule.amount,
                    lineTotal: bill.rule.amount,
                    category: bill.rule.category,
                  }])
                }
              });
            }}
          >
            <Text style={{ color: '#FFF', fontFamily: 'Manrope_600SemiBold', fontSize: 13 }}>Record Payment</Text>
          </TouchableOpacity>
        </View>
      )}
    </Pressable>
  );
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [totalReceipts, setTotalReceipts] = useState<number>(0);
  const [itemSpend, setItemSpend] = useState<ItemSpendRecord[]>([]);
  const [reviewQueueCount, setReviewQueueCount] = useState<number>(0);
  const [upcomingBills, setUpcomingBills] = useState<UpcomingBill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('thisMonth');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [weeklyPulse, setWeeklyPulse] = useState<WeeklyPulseData | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const loadData = useCallback(async (getIsActive: () => boolean = () => true) => {
    try {
      if (getIsActive()) setHasError(false);
      
      const range = getDateRange(dateFilter);
      const filters = {
        searchQuery: debouncedSearchQuery,
        startDate: range?.start,
        endDate: range?.end,
        category: categoryFilter,
      };

      const now = new Date();
      const [receiptData, spendData, countData, reviewData, billsData, pulseData] = await Promise.all([
        getAllReceipts(db, filters),
        getAllItemSpend(db),
        getTotalReceiptCount(db),
        getReceiptsNeedingReview(db),
        getUpcomingBillsThisMonth(db, now.getFullYear(), now.getMonth()),
        generateWeeklyPulse(db, now)
      ]);
      
      if (getIsActive()) {
        setReceipts(receiptData);
        setItemSpend(spendData);
        setTotalReceipts(countData);
        setReviewQueueCount(reviewData.length);
        setUpcomingBills(billsData || []);
        setWeeklyPulse(pulseData);
        setIsLoading(false);
        setIsRefreshing(false);
      }
    } catch (err) {
      console.error('[HomeScreen] load error:', err);
      if (getIsActive()) {
        setIsLoading(false);
        setIsRefreshing(false);
        setHasError(true);
      }
    }
  }, [db, debouncedSearchQuery, dateFilter, categoryFilter]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      loadData(() => isActive);
      return () => {
        isActive = false;
      };
    }, [loadData])
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadData();
  }

  function handleDeletePress(id: string) {
    Alert.alert(
      'Delete this transaction?',
      'This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReceipt(db, id);
              loadData();
            } catch {
              Alert.alert('Delete Failed', 'Could not delete this transaction. Please try again.');
            }
          },
        },
      ]
    );
  }

  function handleDateFilterPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDateSheetVisible(true);
  }

  const range = useMemo(() => getDateRange(dateFilter), [dateFilter]);

  const filteredReceipts = receipts;

  const summaryTotal = useMemo(() => {
    if (categoryFilter === 'All' || debouncedSearchQuery.trim().length > 0) {
      return filteredReceipts.reduce((sum, r) => sum + r.totalAmount, 0);
    }
    return itemSpend
      .filter((rec) => {
        const category = rec.category || 'Other';
        if (category !== categoryFilter) return false;
        const normalized = parsePurchaseDate(rec.purchaseDate);
        return !range || (normalized !== null && normalized >= range.start && normalized < range.end);
      })
      .reduce((sum, rec) => sum + rec.amount, 0);
  }, [categoryFilter, filteredReceipts, itemSpend, range, debouncedSearchQuery]);

  const categoryTotals = useMemo(() => {
    if (debouncedSearchQuery.trim().length > 0) return [];
    
    const totals = new Map<string, number>();
    let totalItemsSpend = 0;
    
    for (const rec of itemSpend) {
      const normalized = parsePurchaseDate(rec.purchaseDate);
      if (range && (normalized === null || normalized < range.start || normalized >= range.end)) {
        continue;
      }
      const cat = rec.category || 'Other';
      totals.set(cat, (totals.get(cat) || 0) + rec.amount);
      totalItemsSpend += rec.amount;
    }
    
    const sorted = Array.from(totals.entries())
      .map(([category, amount]) => ({ category, amount, meta: getCategoryMeta(category) }))
      .sort((a, b) => b.amount - a.amount);
      
    return { data: sorted, total: totalItemsSpend };
  }, [itemSpend, range, debouncedSearchQuery]);

  const [searchVisible, setSearchVisible] = useState(false);
  const [isDateSheetVisible, setDateSheetVisible] = useState(false);

  if (hasError) {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
        <StateView
          icon="alert-circle-outline"
          iconTone="error"
          title="Could not load data"
          subtitle="Something went wrong. Pull to refresh or restart the app."
          primaryLabel="Try Again"
          onPrimaryPress={loadData}
        />
      </View>
    );
  }

  if (!isLoading && totalReceipts === 0) {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
        <StateView
          icon="receipt-outline"
          title="No receipts yet"
          subtitle="Scan a receipt or payment proof and we'll organize it for you."
          primaryLabel="Scan a receipt"
          onPrimaryPress={() => router.push('/scan')}
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
        data={filteredReceipts.slice(0, 5)}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.textPrimary} />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ paddingTop: Math.max(insets.top, 16) }}>
            {/* Dynamic Header */}
            <View style={styles.headerSection}>
              {searchVisible ? (
                <View style={[styles.searchBox, { flex: 1, marginBottom: 0 }]}>
                  <Ionicons name="search" size={18} color={colors.textTertiary} style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search transactions"
                    placeholderTextColor={colors.textTertiary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="search"
                    autoFocus
                  />
                  <TouchableOpacity 
                    onPress={() => { setSearchQuery(''); setSearchVisible(false); }} 
                    style={styles.searchClearBtn}
                    hitSlop={{top:10, bottom:10, left:10, right:10}}
                  >
                    <Text style={{ color: colors.accent, fontFamily: 'Manrope_600SemiBold' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.headerTitleRow}>
                  <Text style={styles.headerTitle}>Overview</Text>
                  
                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <TouchableOpacity onPress={() => setSearchVisible(true)}>
                      <Ionicons name="search-outline" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                    
                    <TouchableOpacity onPress={() => router.push('/settings')}>
                      <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            
            {/* Review Queue Card */}
            {reviewQueueCount > 0 && !searchVisible && debouncedSearchQuery === '' && (
              <TouchableOpacity
                style={styles.reviewQueueCard}
                activeOpacity={0.8}
                onPress={() => router.push('/review-queue')}
              >
                <View style={styles.reviewQueueHeader}>
                  <Ionicons name="warning" size={20} color={colors.warning} />
                  <Text style={styles.reviewQueueTitle}>Needs Attention</Text>
                </View>
                <Text style={styles.reviewQueueSubtitle}>
                  {reviewQueueCount} {reviewQueueCount === 1 ? 'receipt needs' : 'receipts need'} review
                </Text>
                <View style={styles.reviewQueueFooter}>
                  <Text style={styles.reviewQueueAction}>Review your recent transactions</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
            )}

            {/* Modern Spending Card */}
            {(!searchVisible && debouncedSearchQuery === '' && totalReceipts > 0) ? (
              <View style={styles.modernCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View>
                      <Text style={styles.modernCardLabel}>
                        {categoryFilter === 'All' ? 'TOTAL SPENT' : `${categoryFilter.toUpperCase()} SPEND`}
                      </Text>
                      <AnimatedNumber value={summaryTotal} formatter={formatRupiah} style={styles.modernCardAmount} />
                      {summaryTotal === 0 && (
                        <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 13, color: colors.textSecondary, marginTop: 4 }}>
                          No spending recorded this month.
                        </Text>
                      )}
                    </View>
                  
                  <TouchableOpacity 
                    style={styles.timeFilterPill}
                    onPress={handleDateFilterPress}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.timeFilterPillText}>
                      {DATE_FILTERS.find(f => f.key === dateFilter)?.label}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                
                {/* Stacked Bar Chart */}
                {categoryFilter === 'All' && !Array.isArray(categoryTotals) && categoryTotals.total > 0 && categoryTotals.data.length > 0 && (
                  <View style={styles.chartWrapper}>
                    <View style={styles.chartTrack}>
                      {categoryTotals.data.map((item) => {
                        const pct = (item.amount / categoryTotals.total) * 100;
                        if (pct < 1) return null;
                        return (
                          <View key={item.category} style={[styles.chartSegment, { width: `${pct}%`, backgroundColor: item.meta.color }]} />
                        );
                      })}
                    </View>
                    <View style={styles.chartLegend}>
                      {categoryTotals.data.slice(0, 4).map(item => {
                        const pct = Math.round((item.amount / categoryTotals.total) * 100);
                        return (
                          <TouchableOpacity key={item.category} style={styles.legendItem} onPress={() => setCategoryFilter(item.category)} activeOpacity={0.7}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                              <View style={[styles.legendDot, { backgroundColor: item.meta.color }]} />
                              <Text style={styles.legendText} numberOfLines={1}>{item.category}</Text>
                            </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <Text style={[styles.legendAmount, { width: 36, textAlign: 'right' }]}>{pct}%</Text>
                                <Text style={[styles.legendAmount, { width: 85, textAlign: 'right', color: colors.textPrimary }]}>{formatRupiah(item.amount)}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  </View>
                )}
              </View>
            ) : (
              debouncedSearchQuery.length > 0 && (
                <View style={styles.modernCard}>
                  <Text style={styles.modernCardLabel}>SEARCH RESULTS</Text>
                  <AnimatedNumber value={summaryTotal} formatter={formatRupiah} style={styles.modernCardAmount} />
                </View>
              )
            )}
            {/* Weekly Pulse Card */}
            {debouncedSearchQuery === '' && totalReceipts > 0 && weeklyPulse && (
              <WeeklyPulseCard data={weeklyPulse} />
            )}

            {/* Horizontal Scrollable Category Chips (Mini) */}
            {debouncedSearchQuery === '' && totalReceipts > 0 && (
              <View style={styles.categoryFilterContainerMini}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryChipScrollMini}
                >
                  {['All', ...CATEGORIES].map((category) => {
                    const isSelected = categoryFilter === category;
                    const meta = category !== 'All' ? getCategoryMeta(category) : null;
                    return (
                      <CategoryChip
                        key={category}
                        category={category}
                        isSelected={isSelected}
                        meta={meta}
                        onPress={() => {
                          if (!isSelected) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setCategoryFilter(category);
                        }}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Section Header */}
            {totalReceipts > 0 && (
              <View style={styles.transactionHeaderSection}>
                  <Text style={styles.sectionTitle}>Transactions</Text>
                  <TouchableOpacity onPress={() => router.push('/history')} activeOpacity={0.7}>
                    <Text style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: colors.accent }}>See All</Text>
                  </TouchableOpacity>
                </View>
            )}
          </View>
        }
          ListFooterComponent={
            searchQuery.trim().length === 0 ? (
              <View style={{ paddingTop: spacing.xl, paddingBottom: insets.bottom + 100 }}>
                {/* Upcoming Bills Section */}
            {(() => {
              const unpaidBills = upcomingBills.filter(b => !b.isPaid);
              return !searchVisible && debouncedSearchQuery === '' && unpaidBills.length > 0 && (

              <View style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: spacing.md, marginBottom: spacing.md }}>
                  <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 16, color: colors.textPrimary }}>
                    Recurring Bills
                  </Text>
                  <TouchableOpacity onPress={() => router.push('/recurring')}>
                    <Text style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: colors.accent }}>See All</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
                  {unpaidBills.sort((a, b) => {
                    const dA = new Date(a.dueDate).getTime();
                    const dB = new Date(b.dueDate).getTime();
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    
                    const score = (bill: typeof a) => {
                      if (bill.isPaid) return 5;
                      const d = new Date(bill.dueDate).getTime();
                      if (d < today.getTime()) return 1; // Overdue
                      if (d === today.getTime()) return 2; // Due today
                      if (d <= today.getTime() + (1000 * 60 * 60 * 24 * 3)) return 3; // Due soon (within 3 days)
                      return 4; // Upcoming
                    };
                    
                    const sA = score(a);
                    const sB = score(b);
                    if (sA !== sB) return sA - sB;
                    return dA - dB;
                  }).slice(0, 3).map(bill => (
                    <ExpandableBillRow key={bill.rule.id} bill={bill} />
                  ))}
                </View>
              </View>
              );
            })()}

              
                {/* Quick Actions Grid */}
              {(!searchVisible && debouncedSearchQuery === '' && totalReceipts > 0) && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 32, marginBottom: 20, marginTop: 4 }}>
                  <TouchableOpacity style={{ alignItems: 'center', gap: 6 }} onPress={() => router.push('/history')} activeOpacity={0.7}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="time" size={20} color={colors.primary} />
                    </View>
                    <Text style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 11, color: colors.textSecondary }}>History</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={{ alignItems: 'center', gap: 6 }} onPress={() => router.push('/recurring')} activeOpacity={0.7}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="repeat" size={20} color={colors.primary} />
                    </View>
                    <Text style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 11, color: colors.textSecondary }}>Recurring</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={{ alignItems: 'center', gap: 6 }} onPress={() => router.push('/price-book')} activeOpacity={0.7}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="pricetag" size={20} color={colors.primary} />
                    </View>
                    <Text style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 11, color: colors.textSecondary }}>Prices</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={{ alignItems: 'center', gap: 6 }} onPress={() => router.push('/budget')} activeOpacity={0.7}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="wallet" size={20} color={colors.primary} />
                    </View>
                    <Text style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 11, color: colors.textSecondary }}>Budget</Text>
                  </TouchableOpacity>
                </View>
              )}

              
              </View>
            ) : <View style={{ height: insets.bottom + 100 }} />
          }
          renderItem={({ item, index }) => {
          const primaryCategory = item.categories[0] || 'Other';
          const primaryMeta = getCategoryMeta(primaryCategory);
          const merchantDisplay = normalizeMerchantName(item.merchantName);
          const dateDisplay = formatDate(item.purchaseDate);

          return (
            <TransactionCard
              id={item.id}
              merchantName={merchantDisplay}
              dateDisplay={dateDisplay}
              primaryCategory={primaryCategory}
              totalAmount={item.totalAmount}
              onPress={() => router.push(`/receipt/${item.id}`)}
              onDelete={handleDeletePress}
            />
          );
        }}
        ListEmptyComponent={
          totalReceipts === 0 ? (
            <View style={styles.absoluteEmptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="receipt-outline" size={48} color={colors.textTertiary} />
              </View>
              <Text style={styles.absoluteEmptyTitle}>Nothing here yet</Text>
              <Text style={styles.absoluteEmptySubtitle}>
                Scan your first receipt and NOTA will organize it for you.
              </Text>
              <TouchableOpacity
                style={styles.emptyScanButton}
                onPress={() => router.push('/scan')}
                activeOpacity={0.8}
              >
                <Ionicons name="scan-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.emptyScanButtonText}>Scan Receipt</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyFilteredState}>
              <Ionicons name="filter-outline" size={32} color={colors.textTertiary} />
              <Text style={styles.emptyFilteredText}>
                {searchQuery.trim().length > 0
                  ? `No transactions found for "${searchQuery.trim()}".`
                  : categoryFilter !== 'All' 
                    ? `No ${categoryFilter} transactions this month.`
                    : "No transactions yet."}
              </Text>
            </View>
          )
        }
      />

      <BottomSheet
        visible={isDateSheetVisible}
        onClose={() => setDateSheetVisible(false)}
        options={DATE_FILTERS}
        selectedValue={dateFilter}
        onSelect={(key) => setDateFilter(key as DateFilter)}
        title="Select Time Period"
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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsBtn: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.h2,
  },
  modernCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  modernCardLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  modernCardAmount: {
    ...typography.numberHero,
    marginBottom: spacing.md,
  },
  timeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 4,
  },
  timeFilterPillText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: 'Manrope_600SemiBold',
  },
  chartWrapper: {
    marginTop: spacing.xs,
  },
  chartTrack: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.primaryMuted,
    marginBottom: spacing.sm,
  },
  chartSegment: {
    height: '100%',
  },
  chartLegend: {
    marginTop: spacing.sm,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendText: {
    ...typography.bodySecondary,
    color: colors.textPrimary,
  },
  legendAmount: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: 'Manrope_600SemiBold',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9', // same as periodSegmentWrapper
    borderRadius: radius.md,
    height: 40,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    height: 40,
    paddingVertical: 0, // fixes vertical alignment on android
  },
  searchClearBtn: {
    padding: 4,
    marginLeft: 4,
  },
  categoryFilterContainerMini: {
    marginBottom: spacing.md,
  },
  categoryChipScrollMini: {
    paddingHorizontal: spacing.md,
    paddingRight: spacing.lg,
    gap: 8,
  },

  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    height: 32,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  categoryChipText: {
    ...typography.bodySecondary,
  },
  categoryChipTextActive: {
    color: colors.textOnPrimary,
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
    ...typography.h3,
  },
  transactionCountBadge: {
    ...typography.caption,
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
  absoluteEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    paddingHorizontal: spacing.xl,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  absoluteEmptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  absoluteEmptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  emptyScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  emptyScanButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: colors.textOnPrimary,
  },
  reviewQueueCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    backgroundColor: '#FFFAED', // Very subtle warm warning background
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#FFE299', // Gentle orange/yellow border
  },
  reviewQueueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  reviewQueueTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: colors.warning,
  },
  reviewQueueSubtitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  reviewQueueFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewQueueAction: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
});










