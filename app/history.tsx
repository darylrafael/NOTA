import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  TextInput,
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
import { getAllReceipts, getMonthlyItemSpend, ReceiptSummary, ItemSpendRecord } from '../db/queries';
import { colors, typography, spacing, radius } from '../constants/theme';
import { formatRupiah, normalizeMerchantName } from '../lib/format';
import TransactionCard from '../components/TransactionCard';
import CategoryPickerModal from '../components/CategoryPickerModal';
import { getCategoryMeta, CATEGORIES } from '../constants/categories';

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();

  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    return d;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [itemSpends, setItemSpends] = useState<ItemSpendRecord[]>([]);
  const [prevMonthTotal, setPrevMonthTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const start = new Date(currentDate);
      const end = new Date(currentDate);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);

      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}T23:59:59.999Z`;

      const loadedReceipts = await getAllReceipts(db, {
        startDate: startStr,
        endDate: endStr,
        category: selectedCategory !== 'All' ? selectedCategory : undefined,
        searchQuery: debouncedSearch,
      });
      setReceipts(loadedReceipts);

      const spends = await getMonthlyItemSpend(db, startStr, endStr);
      setItemSpends(spends);

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
  }, [db, currentDate, selectedCategory, debouncedSearch]);

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

  const isFutureMonth = useMemo(() => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() + 1);
    const now = new Date();
    return next > now;
  }, [currentDate]);

  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const prevMonthLabel = useMemo(() => {
    const p = new Date(currentDate);
    p.setMonth(p.getMonth() - 1);
    return p.toLocaleDateString('en-US', { month: 'long' });
  }, [currentDate]);

  const totalSpent = useMemo(() => {
    if (debouncedSearch.trim() !== '') {
      return receipts.reduce((sum, r) => sum + r.totalAmount, 0);
    }
    if (selectedCategory !== 'All') {
      return itemSpends.filter(s => s.category === selectedCategory).reduce((sum, r) => sum + r.amount, 0);
    }
    return itemSpends.reduce((sum, r) => sum + r.amount, 0);
  }, [itemSpends, receipts, selectedCategory, debouncedSearch]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of itemSpends) {
      map.set(s.category, (map.get(s.category) || 0) + s.amount);
    }
    const total = itemSpends.reduce((sum, s) => sum + s.amount, 0);
    
    return Array.from(map.entries())
      .map(([cat, amt]) => ({
        category: cat,
        amount: amt,
        percentage: total > 0 ? Math.round((amt / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [itemSpends]);

  const topCategoryChips = useMemo(() => {
    const activeCats = categoryBreakdown.map(c => c.category);
    const top = activeCats.slice(0, 3);
    if (top.length === 0) {
      return ['Food & Drink', 'Groceries', 'Transport'];
    }
    if (selectedCategory !== 'All' && !top.includes(selectedCategory)) {
      if (top.length >= 3) top.pop();
      top.push(selectedCategory);
    }
    return top;
  }, [categoryBreakdown, selectedCategory]);

  const sections = useMemo(() => {
    const groups = new Map<string, typeof receipts>();
    const todayStr = new Date().toLocaleDateString('en-CA');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA');

    for (const r of receipts) {
      const d = new Date(r.purchaseDate);
      const dStr = d.toLocaleDateString('en-CA');
      let title = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
      if (dStr === todayStr) title = 'TODAY';
      else if (dStr === yesterdayStr) title = 'YESTERDAY';

      if (!groups.has(title)) groups.set(title, []);
      groups.get(title)!.push(r);
    }

    return Array.from(groups.entries()).map(([title, data]) => ({ title, data }));
  }, [receipts]);

  const renderHeader = () => (
    <View style={styles.header}>
      {isSearchActive ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search merchant or item..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            returnKeyType="search"
          />
          <TouchableOpacity onPress={() => { setIsSearchActive(false); setSearchQuery(''); }} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Text style={{ fontFamily: 'Manrope_600SemiBold', color: colors.accent, marginLeft: 8 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.headerSide}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.navArrow} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowMonthPicker(true)} style={styles.monthLabelBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Text style={styles.monthLabel}>{monthLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNextMonth} disabled={isFutureMonth} style={[styles.navArrow, isFutureMonth && { opacity: 0.3 }]} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          
          <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
            <TouchableOpacity onPress={() => setIsSearchActive(true)} style={styles.searchBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Ionicons name="search" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  const getMoMText = () => {
    if (prevMonthTotal === 0 && totalSpent > 0) return 'New spending this month';
    if (prevMonthTotal === 0 && totalSpent === 0) return `No spending in ${prevMonthLabel}`;
    const diff = totalSpent - prevMonthTotal;
    if (diff === 0) return `No change vs ${prevMonthLabel}`;
    const pct = Math.round((Math.abs(diff) / prevMonthTotal) * 100);
    const arrow = diff > 0 ? '\u2191' : '\u2193';
    return `${arrow} ${formatRupiah(Math.abs(diff))} (${pct.toLocaleString('en-US')}%) vs ${prevMonthLabel}`;
  };

  const getContextText = () => {
    if (receipts.length === 0) return '';
    const txCount = receipts.length;
    if (selectedCategory !== 'All') {
      return `${txCount} transaction${txCount !== 1 ? 's' : ''} \u00B7 ${selectedCategory}`;
    }
    const catCount = categoryBreakdown.length;
    return `${txCount} transaction${txCount !== 1 ? 's' : ''} \u00B7 ${catCount} categor${catCount !== 1 ? 'ies' : 'y'}`;
  };

  const renderMonthPicker = () => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        {renderHeader()}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.summaryContainer}>
            <Text style={styles.totalLabel}>
              {selectedCategory !== 'All' ? `${selectedCategory} Spent` : 'Total Spent'}
            </Text>
            <Text style={styles.totalValue}>{formatRupiah(totalSpent)}</Text>
            
            {!debouncedSearch && selectedCategory === 'All' && (
              <View style={styles.contextBlock}>
                <Text style={styles.momText}>{getMoMText()}</Text>
                {receipts.length > 0 && <Text style={styles.contextText}>{getContextText()}</Text>}
              </View>
            )}

            <View style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 8 }}
                data={['All', ...topCategoryChips, 'More']}
                keyExtractor={item => item}
                renderItem={({ item: cat }) => {
                  if (cat === 'More') {
                    return (
                      <TouchableOpacity
                        style={styles.chip}
                        onPress={() => setShowCategoryPicker(true)}
                      >
                        <Text style={styles.chipText}>More</Text>
                      </TouchableOpacity>
                    );
                  }
                  
                  const isActive = selectedCategory === cat;
                  return (
                    <TouchableOpacity
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => setSelectedCategory(cat)}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            <View style={styles.transactionsHeaderSection}>
              <Text style={styles.sectionTitle}>
                {selectedCategory !== 'All' ? `${selectedCategory} \u00B7 ${receipts.length} transaction${receipts.length !== 1 ? 's' : ''}` : 'Transactions'}
              </Text>
              {selectedCategory === 'All' && <Text style={styles.transactionCountBadge}>{receipts.length}</Text>}
            </View>
          </View>
        }
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.dateHeader}>{title}</Text>
        )}
        renderItem={({ item }) => (
          <TransactionCard
            id={item.id}
            merchantName={normalizeMerchantName(item.merchantName)}
            dateDisplay={new Date(item.purchaseDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            primaryCategory={item.categories[0] || 'Other'}
            totalAmount={item.totalAmount}
            onPress={() => router.push(`/receipt/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptySub}>No spending in {monthLabel}.</Text>
            </View>
          ) : (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 40 }} />
          )
        }
      />
      {renderMonthPicker()}
      
      <CategoryPickerModal
        visible={showCategoryPicker}
        selectedCategory={selectedCategory}
        onSelect={(cat) => {
          setSelectedCategory(cat);
          setShowCategoryPicker(false);
        }}
        onClose={() => setShowCategoryPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    height: 56,
  },
  headerSide: { flex: 1, justifyContent: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { fontFamily: 'Manrope_600SemiBold', fontSize: 16, color: colors.textPrimary, marginLeft: -4 },
  monthNav: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  navArrow: { padding: spacing.xs },
  monthLabelBtn: { paddingHorizontal: 12 },
  monthLabel: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: colors.textPrimary },
  searchBtn: { padding: spacing.xs },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: radius.md, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, marginLeft: 8, fontFamily: 'Manrope_500Medium', fontSize: 15 },
  
  summaryContainer: { paddingTop: spacing.xl, paddingBottom: spacing.sm },
  totalLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, paddingHorizontal: spacing.md },
  totalValue: { ...typography.numberHero, fontSize: 36, marginBottom: 12, paddingHorizontal: spacing.md },
  
  contextBlock: { paddingHorizontal: spacing.md, gap: 4 },
  momText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: colors.textPrimary },
  contextText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: colors.textTertiary },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: spacing.md },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: '#FFF', borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: colors.textSecondary },
  chipTextActive: { color: '#FFF' },

  transactionsHeaderSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { ...typography.h3 },
  transactionCountBadge: { ...typography.caption, color: colors.textTertiary },
  
  dateHeader: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: colors.textTertiary, paddingHorizontal: spacing.md, marginTop: spacing.md, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: spacing.xl },
  emptySub: { fontFamily: 'Manrope_500Medium', fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
  
  pickerContainer: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  pickerTitle: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  pickerItem: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  pickerItemText: { fontFamily: 'Manrope_500Medium', fontSize: 15, textAlign: 'center', color: colors.textPrimary }
});
