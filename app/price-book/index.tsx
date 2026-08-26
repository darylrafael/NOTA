import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getPriceBookItems } from '../../db/queries';
import { PriceBookItem } from '../../types/receipt';
import { formatRupiah, toTitleCase } from '../../lib/format';
import { formatPurchaseDateShort } from '../../lib/date';
import { colors, spacing, radius } from '../../constants/theme';
import { getCategoryMeta } from '../../constants/categories';

export default function PriceBookScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<PriceBookItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadItems = useCallback(async () => {
    try {
      const data = await getPriceBookItems(db, searchQuery);
      setItems(data);
    } catch (e) {
      console.error('Failed to load price book items', e);
    } finally {
      setIsLoading(false);
    }
  }, [db, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  const renderItem = ({ item }: { item: PriceBookItem }) => {
    const categoryMeta = getCategoryMeta(item.category);
    
    return (
      <TouchableOpacity 
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push(`/price-book/${encodeURIComponent(item.normalizedName)}`)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.titleRow}>
            <View style={[styles.iconWrapper, { backgroundColor: categoryMeta.color + '20' }]}>
              <Ionicons name={categoryMeta.icon as any} size={20} color={categoryMeta.color} />
            </View>
            <View>
              <Text style={styles.itemName} numberOfLines={1}>{toTitleCase(item.itemName)}</Text>
              <Text style={styles.categoryText}>{item.category || 'Other'}</Text>
            </View>
          </View>
          <View style={styles.statsBadge}>
            <Text style={styles.statsText}>{item.purchaseCount}x bought</Text>
          </View>
        </View>

        <View style={styles.priceRow}>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Lowest</Text>
            <Text style={styles.priceValue}>{formatRupiah(item.minPrice)}</Text>
          </View>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Average</Text>
            <Text style={styles.priceValue}>{formatRupiah(item.avgPrice)}</Text>
          </View>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Highest</Text>
            <Text style={styles.priceValue}>{formatRupiah(item.maxPrice)}</Text>
          </View>
        </View>

        <View style={styles.lastPurchaseRow}>
          <Text style={styles.lastPurchaseText}>
            Last bought {formatPurchaseDateShort(item.lastPurchaseDate)} for <Text style={styles.lastPriceHighlight}>{formatRupiah(item.lastPrice)}</Text>
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search items or categories..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, idx) => `${item.normalizedName}-${idx}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="pricetags-outline" size={48} color={colors.border} />
              <Text style={styles.emptyTitle}>No items found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery.trim().length > 0
                  ? "We couldn't find any items matching your search."
                  : "Scan your receipts to start tracking item prices over time."}
              </Text>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  listContent: {
    padding: spacing.md,
    paddingTop: 0,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  itemName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  categoryText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  statsBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statsText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  priceItem: {
    flex: 1,
    alignItems: 'center',
  },
  priceLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: colors.textTertiary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  priceValue: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  lastPurchaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  lastPurchaseText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  lastPriceHighlight: {
    fontFamily: 'Manrope_700Bold',
    color: colors.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    marginTop: spacing.xxl,
  },
  emptyTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  }
});
