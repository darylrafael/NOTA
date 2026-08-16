import { useCallback, useState, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { useLocalSearchParams, useFocusEffect, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getItemsByCategory, CategoryItemDetail } from '../../db/queries';
import { getCategoryMeta } from '../../constants/categories';
import { formatRupiah, toTitleCase } from '../../lib/format';
import { colors, spacing, radius } from '../../constants/theme';
import StateView from '../../components/StateView';

export default function CategoryDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const db = useSQLiteContext();
  const [items, setItems] = useState<CategoryItemDetail[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      async function load() {
        if (!name) return;
        try {
          setHasError(false);
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
          const data = await getItemsByCategory(db, name, monthStart, monthEnd);
          if (isActive) {
            setItems(data);
            setIsLoading(false);
          }
        } catch (err) {
          console.error('[CategoryDetailScreen] load error:', err);
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
    }, [db, name])
  );

  const meta = getCategoryMeta(name ?? 'Other');

  // Group / list unique merchants for filter chips
  const merchants = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.merchantName && item.merchantName.trim().length > 0) {
        set.add(item.merchantName.trim());
      } else {
        set.add('Unknown Store');
      }
    }
    return ['All', ...Array.from(set)];
  }, [items]);

  // Filter items based on selected merchant chip
  const filteredItems = useMemo(() => {
    if (selectedMerchant === 'All') return items;
    return items.filter((item) => {
      const mName = item.merchantName && item.merchantName.trim().length > 0 ? item.merchantName.trim() : 'Unknown Store';
      return mName === selectedMerchant;
    });
  }, [items, selectedMerchant]);

  const filteredTotal = useMemo(() => {
    return filteredItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [filteredItems]);

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

  return (
    <View style={styles.flex}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <Stack.Screen 
        options={{ 
          title: name ?? 'Category Details',
          headerBackTitle: 'Back',
          headerTitleStyle: {
            fontFamily: 'Manrope_700Bold',
            fontSize: 16,
            color: '#0F172A',
          },
        }} 
      />

      {items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No items in this category this month.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={filteredItems}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.headerSection}>
              {/* Category Summary Header (Monzo / Apple Wallet Style) */}
              <View style={styles.heroCard}>
                <View style={[styles.categoryDot, { backgroundColor: meta.color }]} />
                <Text style={styles.heroCategoryName}>{name}</Text>
                <Text style={styles.heroTotalAmount}>{formatRupiah(filteredTotal)}</Text>
                <Text style={styles.heroSubtext}>
                  {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'} {selectedMerchant !== 'All' ? `at ${selectedMerchant}` : 'this month'}
                </Text>
              </View>

              {/* Scrollable Filter Chips */}
              {merchants.length > 2 && (
                <View style={styles.filterWrapper}>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={styles.filterScroll}
                  >
                    {merchants.map((merchant) => {
                      const isSelected = selectedMerchant === merchant;
                      return (
                        <TouchableOpacity
                          key={merchant}
                          style={[styles.chip, isSelected && styles.chipActive]}
                          onPress={() => setSelectedMerchant(merchant)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                            {merchant}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <Text style={styles.sectionTitle}>Breakdown</Text>
            </View>
          }
          // Render grouped list container
          renderItem={({ item, index }) => {
            const merchantLabel = item.merchantName?.trim() || 'Store';
            const dateStr = formatDate(item.purchaseDate);
            const qtyStr = item.quantity > 1 ? `${item.quantity}× · ` : '';
            const isFirst = index === 0;
            const isLast = index === filteredItems.length - 1;

            return (
              <View
                style={[
                  styles.groupedItemRow,
                  isFirst && styles.groupedItemRowFirst,
                  isLast && styles.groupedItemRowLast,
                  !isLast && styles.groupedItemRowDivider,
                ]}
              >
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {toTitleCase(item.name)}
                  </Text>
                  <Text style={styles.itemMeta} numberOfLines={1}>
                    {merchantLabel} · {qtyStr}{dateStr}
                  </Text>
                </View>
                <Text style={styles.itemPrice}>{formatRupiah(item.price * item.quantity)}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FAFAFA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA' },
  emptyText: { color: '#64748B', fontFamily: 'Manrope_600SemiBold', fontSize: 14 },
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 6,
  },
  heroCategoryName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroTotalAmount: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 28,
    color: '#0F172A',
    letterSpacing: -0.8,
    marginTop: 2,
    marginBottom: 2,
  },
  heroSubtext: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#94A3B8',
  },
  filterWrapper: {
    marginBottom: spacing.md,
    marginHorizontal: -spacing.md,
  },
  filterScroll: {
    paddingHorizontal: spacing.md,
    paddingRight: spacing.xl,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  chipText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#64748B',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
  },
  sectionTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#0F172A',
    marginBottom: spacing.xs + 2,
    letterSpacing: -0.2,
  },
  groupedItemRow: {
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
  groupedItemRowFirst: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderTopWidth: 1,
  },
  groupedItemRowLast: {
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    borderBottomWidth: 1,
  },
  groupedItemRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemInfo: { 
    flex: 1, 
    marginRight: 12 
  },
  itemName: { 
    fontFamily: 'Manrope_700Bold', 
    fontSize: 15, 
    color: '#0F172A',
    lineHeight: 20,
  },
  itemMeta: { 
    fontFamily: 'Manrope_600SemiBold', 
    fontSize: 12, 
    color: '#64748B', 
    marginTop: 2,
  },
  itemPrice: { 
    fontFamily: 'Manrope_800ExtraBold', 
    fontSize: 15, 
    color: '#0F172A',
    textAlign: 'right',
    letterSpacing: -0.3,
  },
});
