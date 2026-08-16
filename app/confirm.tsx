import { useCallback, useState, useRef, useEffect } from 'react';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSQLiteContext } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveReceipt, updateReceipt, getReceiptDetail } from '../db/queries';
import { formatRupiah } from '../lib/format';
import { CATEGORIES, getCategoryMeta } from '../constants/categories';
import { colors, spacing, radius } from '../constants/theme';
import Button from '../components/Button';
import CategoryPickerModal from '../components/CategoryPickerModal';
import { EditableReceiptItem } from '../types/receipt';

function createBlankItem(): EditableReceiptItem {
  return { localId: randomUUID(), name: '', price: 0, quantity: 1, category: 'Other', lineTotal: 0 };
}

export default function ConfirmScreen() {
  const params = useLocalSearchParams<{
    items?: string;
    merchantName?: string;
    receiptId?: string;
    receiptTotal?: string;
    tax?: string;
    serviceCharge?: string;
    sourceType?: string;
  }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const isEditMode = !!params.receiptId;

  const [items, setItems] = useState<EditableReceiptItem[]>(() => {
    if (params.items) {
      const parsed: EditableReceiptItem[] = JSON.parse(params.items);
      return parsed.length > 0 ? parsed : [createBlankItem()];
    }
    return isEditMode ? [] : [createBlankItem()];
  });
  const [merchantName, setMerchantName] = useState(params.merchantName ?? '');
  const [tax, setTax] = useState(Number(params.tax) || 0);
  const [serviceCharge, setServiceCharge] = useState(Number(params.serviceCharge) || 0);
  const [originalPurchaseDate, setOriginalPurchaseDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceType = params.sourceType ?? 'receipt';

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isEditMode || !params.receiptId) return;
      let isActive = true;
      async function load() {
        const detail = await getReceiptDetail(db, params.receiptId!);
        if (detail && isActive) {
          setItems(
            detail.items.map((item) => ({
              localId: randomUUID(),
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              category: item.category,
              lineTotal: item.price * item.quantity,
            }))
          );
          setMerchantName(detail.merchantName ?? '');
          setTax(detail.tax ?? 0);
          setServiceCharge(detail.serviceCharge ?? 0);
          setOriginalPurchaseDate(detail.purchaseDate);
          setIsLoading(false);
        }
      }
      load();
      return () => {
        isActive = false;
      };
    }, [db, params.receiptId, isEditMode])
  );

  const itemsTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = itemsTotal + tax + serviceCharge;

  function updateItem(localId: string, field: 'name' | 'price' | 'quantity', value: string) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.localId !== localId) return item;
        if (field === 'name') return { ...item, name: value };
        const numValue = Number(value) || 0;
        if (field === 'price') return { ...item, price: numValue, lineTotal: numValue * item.quantity };
        return { ...item, quantity: numValue, lineTotal: item.price * numValue };
      })
    );
  }

  function updateCategory(localId: string, category: string) {
    setItems((prev) => prev.map((item) => (item.localId === localId ? { ...item, category } : item)));
  }

  function deleteItem(localId: string) {
    if (items.length <= 1) {
      Alert.alert('Cannot Delete', 'A receipt must have at least one item. You can edit this item instead.');
      return;
    }
    setItems((prev) => prev.filter((item) => item.localId !== localId));
  }

  function addItem() {
    setItems((prev) => [...prev, createBlankItem()]);
  }

  function handleCategoryPress(localId: string) {
    setPickerTargetId(localId);
  }

  async function handleSave() {
    if (items.length === 0) {
      Alert.alert('No Items', 'Add at least one item before saving.');
      return;
    }
    const invalid = items.find(
      (item) => item.name.trim().length === 0 || item.price <= 0 || item.quantity <= 0
    );
    if (invalid) {
      Alert.alert('Check Your Items', 'Every item needs a name, a price above 0, and a quantity above 0.');
      return;
    }

    setIsSaving(true);
    try {
      if (isEditMode && params.receiptId) {
        await updateReceipt(
          db,
          params.receiptId,
          originalPurchaseDate ?? new Date().toISOString(),
          items,
          merchantName.trim() || null,
          tax,
          serviceCharge,
          sourceType
        );
      } else {
        await saveReceipt(
          db, 
          new Date().toISOString(), 
          items, 
          merchantName.trim() || null,
          tax,
          serviceCharge,
          sourceType
        );
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowToast(true);
      toastTimeoutRef.current = setTimeout(() => {
        if (isEditMode && params.receiptId) {
          router.replace(`/receipt/${params.receiptId}`);
        } else {
          router.replace('/');
        }
      }, 1500);
    } catch (err) {
      setIsSaving(false);
      Alert.alert('Save Failed', 'Could not save this receipt. Please try again.');
    }
  }

  function handleCancel() {
    Alert.alert(
      isEditMode ? 'Discard Changes?' : 'Discard Receipt?',
      isEditMode 
        ? 'Any changes you made to this receipt will not be saved.' 
        : 'This scanned receipt has not been saved yet. Do you want to cancel and go back?',
      [
        { text: 'Keep Editing', style: 'cancel' },
        { 
          text: isEditMode ? 'Discard' : 'Discard Receipt', 
          style: 'destructive',
          onPress: () => router.back()
        },
      ]
    );
  }

  function renderRightActions(localId: string) {
    return (
      <TouchableOpacity style={styles.swipeDeleteButton} onPress={() => deleteItem(localId)}>
        <Ionicons name="trash-outline" size={20} color="#fff" />
      </TouchableOpacity>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#0F172A" />
      </View>
    );
  }

  const selectedItemForPicker = items.find((i) => i.localId === pickerTargetId);

  return (
    <KeyboardAvoidingView 
      style={styles.flex} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <Stack.Screen 
        options={{ 
          title: isEditMode ? 'Edit Receipt' : 'Confirm Items',
          headerBackTitle: 'Cancel',
          headerTitleStyle: {
            fontFamily: 'Manrope_700Bold',
            fontSize: 16,
            color: '#0F172A',
          },
          headerLeft: () => (
            <TouchableOpacity onPress={handleCancel} style={styles.cancelHeaderButton} activeOpacity={0.7}>
              <Text style={styles.cancelHeaderText}>Cancel</Text>
            </TouchableOpacity>
          ),
        }} 
      />
      <CategoryPickerModal
        visible={!!pickerTargetId}
        selectedCategory={selectedItemForPicker?.category}
        onSelect={(category) => {
          if (pickerTargetId) {
            updateCategory(pickerTargetId, category);
          }
        }}
        onClose={() => setPickerTargetId(null)}
      />
      <ScrollView 
        style={styles.flex} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Merchant Card */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>MERCHANT</Text>
          <View style={styles.merchantCard}>
            <TextInput
              style={styles.merchantInput}
              value={merchantName}
              onChangeText={setMerchantName}
              placeholder="Merchant / Store Name"
              placeholderTextColor="#94A3B8"
            />
          </View>
        </View>

        {/* Items Grouped Table */}
        <View style={styles.sectionBlock}>
          <View style={styles.itemsHeaderRow}>
            <Text style={styles.sectionLabel}>PURCHASED ITEMS ({items.length})</Text>
            <TouchableOpacity onPress={addItem} style={styles.addRowInlineBtn} activeOpacity={0.7}>
              <Ionicons name="add" size={14} color="#0F172A" />
              <Text style={styles.addRowInlineText}>Add Item</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.itemsContainer}>
            {items.map((item, index) => {
              const meta = getCategoryMeta(item.category);
              const isFirst = index === 0;
              const isLast = index === items.length - 1;

              return (
                <Swipeable key={item.localId} renderRightActions={() => renderRightActions(item.localId)}>
                  <View 
                    style={[
                      styles.itemRow, 
                      isFirst && styles.itemRowFirst,
                      isLast && styles.itemRowLast,
                      !isLast && styles.itemRowBorder
                    ]}
                  >
                    <View style={styles.itemRowTop}>
                      <TextInput
                        style={styles.nameInput}
                        value={item.name}
                        onChangeText={(v) => updateItem(item.localId, 'name', v)}
                        placeholder="Item name"
                        placeholderTextColor="#94A3B8"
                      />
                      <TouchableOpacity
                        style={[styles.categoryBadge, { backgroundColor: meta.color + '15' }]}
                        onPress={() => handleCategoryPress(item.localId)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.categoryBadgeText, { color: meta.color }]}>
                          {(item.category || 'Other').toUpperCase()}
                        </Text>
                        <Ionicons name="chevron-down" size={10} color={meta.color} style={{ marginLeft: 2 }} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.itemDetailsRow}>
                      <View style={styles.qtyWrap}>
                        <TextInput
                          style={styles.numberInput}
                          value={String(item.quantity)}
                          onChangeText={(v) => updateItem(item.localId, 'quantity', v)}
                          keyboardType="number-pad"
                        />
                      </View>
                      <Text style={styles.multiplySign}>×</Text>
                      <View style={styles.priceWrap}>
                        <Text style={styles.currencySymbol}>Rp</Text>
                        <TextInput
                          style={styles.priceInput}
                          value={String(item.price)}
                          onChangeText={(v) => updateItem(item.localId, 'price', v)}
                          keyboardType="number-pad"
                        />
                      </View>
                      <Text style={styles.lineTotalText}>{formatRupiah(item.lineTotal)}</Text>
                    </View>
                  </View>
                </Swipeable>
              );
            })}
          </View>
        </View>

        {/* Calculation & Summary Grouped Card */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>CALCULATION</Text>
          <View style={styles.summaryContainer}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatRupiah(itemsTotal)}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tax (Pajak / PB1 / PPN)</Text>
              <View style={styles.chargeInputRow}>
                <Text style={styles.currencyPrefix}>Rp</Text>
                <TextInput
                  style={styles.chargeInput}
                  value={String(tax)}
                  onChangeText={(v) => setTax(Number(v) || 0)}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Service Charge</Text>
              <View style={styles.chargeInputRow}>
                <Text style={styles.currencyPrefix}>Rp</Text>
                <TextInput
                  style={styles.chargeInput}
                  value={String(serviceCharge)}
                  onChangeText={(v) => setServiceCharge(Number(v) || 0)}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatRupiah(total)}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating Save Actions Bar */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button
          label={isSaving ? 'Saving...' : 'Save Receipt'}
          onPress={handleSave}
          loading={isSaving}
        />
        <TouchableOpacity 
          style={styles.discardButton} 
          onPress={handleCancel}
          disabled={isSaving}
          activeOpacity={0.7}
        >
          <Text style={styles.discardButtonText}>Discard Receipt</Text>
        </TouchableOpacity>
      </View>

      {showToast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>Receipt saved successfully</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FAFAFA' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA' },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: 30 },
  sectionBlock: {
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    color: '#64748B',
    marginBottom: 6,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  merchantCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  merchantInput: { 
    fontFamily: 'Manrope_800ExtraBold', 
    fontSize: 18, 
    color: '#0F172A',
    padding: 0,
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  addRowInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 2,
  },
  addRowInlineText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    color: '#0F172A',
  },
  itemsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  itemRow: {
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
  },
  itemRowFirst: {
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  itemRowLast: {
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  nameInput: {
    flex: 1,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: '#0F172A',
    marginRight: spacing.sm,
    padding: 0,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 10, letterSpacing: 0.4 },
  itemDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyWrap: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  numberInput: {
    fontFamily: 'Manrope_700Bold',
    width: 32,
    textAlign: 'center',
    color: '#0F172A',
    fontSize: 13,
    padding: 0,
  },
  priceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currencySymbol: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: '#94A3B8',
    marginRight: 2,
  },
  priceInput: {
    fontFamily: 'Manrope_700Bold',
    minWidth: 70,
    color: '#0F172A',
    fontSize: 13,
    padding: 0,
  },
  multiplySign: { 
    color: '#94A3B8', 
    marginHorizontal: 8,
    fontFamily: 'Manrope_600SemiBold',
  },
  lineTotalText: { 
    flex: 1, 
    textAlign: 'right', 
    color: '#0F172A', 
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 15,
    letterSpacing: -0.3,
  },
  swipeDeleteButton: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
  },
  summaryContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#64748B',
  },
  summaryValue: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#0F172A',
  },
  chargeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  currencyPrefix: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: '#94A3B8',
    marginRight: 4,
  },
  chargeInput: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: '#0F172A',
    minWidth: 70,
    textAlign: 'right',
    padding: 0,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  totalLabel: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#0F172A' },
  totalValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: '#0F172A', letterSpacing: -0.4 },
  footer: { 
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 4,
  },
  cancelHeaderButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
  },
  cancelHeaderText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 15,
    color: '#64748B',
  },
  discardButton: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardButtonText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: colors.error,
  },
  toast: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  toastText: { fontFamily: 'Manrope_600SemiBold', color: '#fff', fontSize: 13 },
});
