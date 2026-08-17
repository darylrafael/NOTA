import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getBudgets, setBudgets } from '../db/queries';
import { CATEGORIES, getCategoryMeta } from '../constants/categories';
import { parseRupiahInput } from '../lib/money';
import { colors, spacing, radius } from '../constants/theme';
import Button from '../components/Button';
import StateView from '../components/StateView';

export default function BudgetScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      async function load() {
        try {
          setHasError(false);
          const budgets = await getBudgets(db);
          if (isActive) {
            const initial: Record<string, string> = {};
            for (const category of CATEGORIES) {
              initial[category] = budgets[category] ? String(budgets[category]) : '';
            }
            setValues(initial);
          }
        } catch {
          if (isActive) {
            setHasError(true);
          }
        }
      }
      load();
      return () => {
        isActive = false;
      };
    }, [db, retryToken])
  );

  async function handleSave() {
    setIsSaving(true);
    try {
      const payload: Record<string, number | null> = {};
      for (const category of CATEGORIES) {
        const raw = values[category]?.trim();
        if (!raw) {
          payload[category] = null;
        } else {
          const parsed = parseRupiahInput(raw);
          payload[category] = parsed > 0 ? parsed : null;
        }
      }
      await setBudgets(db, payload);
      router.back();
    } catch {
      Alert.alert('Save Failed', 'Could not save budgets. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  if (hasError) {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
        <StateView
          icon="alert-circle-outline"
          iconTone="error"
          title="Could not load budgets"
          subtitle="Something went wrong while loading your monthly limits."
          primaryLabel="Try Again"
          onPrimaryPress={() => {
            setHasError(false);
            setRetryToken((n) => n + 1);
          }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.flex} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <Stack.Screen 
        options={{
          title: 'Monthly Budgets',
          headerBackTitle: 'Back',
          headerTitleStyle: {
            fontFamily: 'Manrope_700Bold',
            fontSize: 16,
            color: '#0F172A',
          },
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.hint}>
          Set a monthly spending limit per category. Leave blank for unbudgeted categories.
        </Text>

        <View style={styles.groupedContainer}>
          {CATEGORIES.map((category, index) => {
            const meta = getCategoryMeta(category);
            const isFirst = index === 0;
            const isLast = index === CATEGORIES.length - 1;

            return (
              <View 
                key={category} 
                style={[
                  styles.row,
                  isFirst && styles.rowFirst,
                  isLast && styles.rowLast,
                  !isLast && styles.rowDivider,
                ]}
              >
                <View style={[styles.iconBadge, { backgroundColor: meta.color + '15' }]}>
                  <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                </View>
                <Text style={styles.categoryName}>{category}</Text>
                <View style={styles.inputWrap}>
                  <Text style={styles.inputPrefix}>Rp</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="No limit"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    value={values[category] ?? ''}
                    onChangeText={(v) => setValues((prev) => ({ ...prev, [category]: v }))}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button
          label={isSaving ? 'Saving...' : 'Save Budgets'}
          onPress={handleSave}
          loading={isSaving}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FAFAFA' },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 40 },
  hint: { 
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13, 
    color: '#64748B', 
    lineHeight: 18, 
    marginBottom: spacing.md 
  },
  groupedContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  rowFirst: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  rowLast: {
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  categoryName: { 
    flex: 1, 
    fontFamily: 'Manrope_700Bold', 
    fontSize: 15, 
    color: '#0F172A' 
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    width: 140,
  },
  inputPrefix: { 
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13, 
    color: '#94A3B8', 
    marginRight: 4 
  },
  input: {
    flex: 1,
    paddingVertical: 7,
    fontSize: 14,
    color: '#0F172A',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'right',
  },
  saveBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
});
