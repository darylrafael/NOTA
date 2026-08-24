import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { getReceiptsNeedingReview, deleteReceipt } from '../db/queries';
import { ReviewQueueItem, ReviewReason } from '../types/receipt';
import { formatRupiah } from '../lib/format';
import { formatPurchaseDate } from '../lib/date';
import { colors } from '../constants/theme';

const REASON_LABELS: Record<ReviewReason, string> = {
  missing_merchant: 'Missing merchant',
  missing_category: 'Unassigned category',
  math_mismatch: "Total doesn't match items",
  potential_duplicate: 'Possible duplicate receipt',
};

export default function ReviewQueueScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const data = await getReceiptsNeedingReview(db);
      setItems(data);
    } catch (e) {
      console.error('Failed to load review queue', e);
    } finally {
      setIsLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handlePress = (item: ReviewQueueItem) => {
    const isDuplicate = item.reasons.includes('potential_duplicate');
    const isShared = item.isSharedExpense;

    if (isDuplicate || isShared) {
      // Safe resolution path: view details and decide to delete/edit
      router.push(`/receipt/${item.id}`);
    } else {
      router.push({
        pathname: '/confirm',
        params: { receiptId: item.id }
      });
    }
  };

  const handleDelete = (receiptId: string) => {
    Alert.alert(
      'Delete Receipt',
      'Are you sure you want to delete this receipt? This action will permanently remove the transaction and its stored image.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReceipt(db, receiptId);
              loadData();
            } catch (e) {
              console.error('Failed to delete receipt', e);
              Alert.alert('Error', 'Failed to delete the receipt. Please try again.');
            }
          }
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>

        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={64} color={colors.success} />
            <Text style={styles.emptyTitle}>All Caught Up!</Text>
            <Text style={styles.emptySubtitle}>No receipts require your attention right now.</Text>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const renderRightActions = () => (
            <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item.id)}>
              <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          );

          return (
            <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
              <TouchableOpacity 
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => handlePress(item)}
              >
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.merchantName} numberOfLines={1}>
                      {item.merchantName || 'Unknown Store'}
                    </Text>
                    <Text style={styles.dateText}>
                      {formatPurchaseDate(item.purchaseDate)}
                    </Text>
                  </View>
                  <Text style={styles.amountText}>{formatRupiah(item.totalAmount)}</Text>
                </View>
                <View style={styles.reasonsContainer}>
                  {item.reasons.map((reason) => {
                    const isPossible = reason === 'potential_duplicate';
                    return (
                      <View key={reason} style={styles.reasonRow}>
                        <Ionicons 
                          name={isPossible ? "help-circle" : "warning"} 
                          size={14} 
                          color={isPossible ? colors.textSecondary : colors.warning} 
                        />
                        <Text style={[styles.reasonText, isPossible && styles.reasonTextMuted]}>
                          {REASON_LABELS[reason]}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </TouchableOpacity>
            </Swipeable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    marginTop: 60,
  },
  emptyTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    fontFamily: 'Manrope_600SemiBold',
    color: '#fff',
    fontSize: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  merchantName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 4,
    maxWidth: 200,
  },
  dateText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  amountText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  reasonsContainer: {
    backgroundColor: colors.background,
    padding: 10,
    borderRadius: 8,
    gap: 6,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reasonText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: colors.warning,
  },
  reasonTextMuted: {
    color: colors.textSecondary,
  },
  deleteButton: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginTop: 8,
    marginBottom: 8,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  deleteText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    color: '#FFFFFF',
    marginTop: 4,
  }
});
