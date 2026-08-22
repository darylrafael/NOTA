import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getAllMerchantPreferences, deleteMerchantPreference, MerchantPreference, saveMerchantPreference } from '../../db/queries';
import { colors, spacing, radius, typography } from '../../constants/theme';
import { getCategoryMeta } from '../../constants/categories';
import CategoryPickerModal from '../../components/CategoryPickerModal';

export default function MerchantRulesScreen() {
  const db = useSQLiteContext();
  const [rules, setRules] = useState<MerchantPreference[]>([]);
  const [editingRule, setEditingRule] = useState<MerchantPreference | null>(null);

  const loadRules = useCallback(async () => {
    const data = await getAllMerchantPreferences(db);
    setRules(data);
  }, [db]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleDelete = (merchantName: string) => {
    Alert.alert(
      'Delete Rule',
      `Are you sure you want to delete the rule for ${merchantName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            await deleteMerchantPreference(db, merchantName);
            await loadRules();
          }
        }
      ]
    );
  };

  const handleCategorySelect = async (category: string) => {
    if (editingRule) {
      await saveMerchantPreference(db, editingRule.merchantName, category);
      await loadRules();
    }
    setEditingRule(null);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Merchant Rules', headerBackTitle: 'Settings' }} />
      
      <FlatList
        data={rules}
        keyExtractor={item => item.merchantName}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="pricetags-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Rules Yet</Text>
            <Text style={styles.emptySubtitle}>
              When you correct a merchant's category and choose to remember it, it will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta = getCategoryMeta(item.category as any);
          return (
            <View style={styles.ruleCard}>
              <View style={styles.ruleInfo}>
                <Text style={styles.merchantName}>{item.merchantName}</Text>
                <TouchableOpacity 
                  style={[styles.categoryBadge, { backgroundColor: meta.color + '15' }]}
                  onPress={() => setEditingRule(item)}
                >
                  <Text style={[styles.categoryBadgeText, { color: meta.color }]}>
                    {item.category.toUpperCase()}
                  </Text>
                  <Ionicons name="chevron-down" size={12} color={meta.color} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item.merchantName)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          );
        }}
      />

      {editingRule && (
        <CategoryPickerModal
          visible={true}
          onClose={() => setEditingRule(null)}
          onSelect={handleCategorySelect}
          selectedCategory={editingRule.category}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, flexGrow: 1 },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    ...typography.bodySecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  ruleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ruleInfo: {
    flex: 1,
    alignItems: 'flex-start',
  },
  merchantName: {
    ...typography.h4,
    marginBottom: spacing.xs,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  categoryBadgeText: {
    ...typography.label,
  },
  deleteBtn: {
    padding: spacing.sm,
  }
});
