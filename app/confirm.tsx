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
import { saveReceipt, updateReceipt, getReceiptDetail, getMerchantPreference, saveMerchantPreference } from '../db/queries';
import { formatRupiah } from '../lib/format';
import { parseRupiahInput, parseQuantityInput, roundRupiah } from '../lib/money';
import {
  applyDatePart,
  dateOnlyToDate,
  formatPurchaseDate,
  parsePurchaseDate,
  shiftDateOnly,
  todayDateOnly,
} from '../lib/date';
import { calculatedReceiptTotal, reconcileTotals } from '../lib/receiptMath';
import { getCategoryMeta } from '../constants/categories';
import { DOCUMENT_TYPE_META } from '../constants/documentTypes';
import { colors, spacing, radius, typography } from '../constants/theme';
import Button from '../components/Button';
import CategoryPickerModal from '../components/CategoryPickerModal';
import AnimatedNumber from '../components/AnimatedNumber';
import { EditableReceiptItem, SourceType } from '../types/receipt';

function createBlankItem(): EditableReceiptItem {
  return { localId: randomUUID(), name: '', price: 0, quantity: 1, category: 'Other', lineTotal: 0 };
}

function parseScannedItems(rawItems?: string): EditableReceiptItem[] {
  if (!rawItems) return [];

  try {
    const parsed: unknown = JSON.parse(rawItems);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item): EditableReceiptItem[] => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.name !== 'string') return [];

      const price = typeof candidate.price === 'number' && Number.isFinite(candidate.price) ? candidate.price : 0;
      const quantity =
        typeof candidate.quantity === 'number' && Number.isFinite(candidate.quantity)
          ? Math.round(candidate.quantity)
          : 1;
      const lineTotal =
        typeof candidate.lineTotal === 'number' && Number.isFinite(candidate.lineTotal) ? candidate.lineTotal : 0;

      return [{
        localId: typeof candidate.localId === 'string' ? candidate.localId : randomUUID(),
        name: candidate.name,
        price,
        quantity,
        category: typeof candidate.category === 'string' && candidate.category ? candidate.category : 'Other',
        lineTotal,
      }];
    });
  } catch {
    return [];
  }
}

function parseOptionalTotal(raw?: string): number | null {
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function DateEditorInputs({
  purchaseDate,
  onChange,
  styles
}: {
  purchaseDate: string;
  onChange: (d: string) => void;
  styles: any;
}) {
  const parts = dateOnlyToDate(purchaseDate);
  const [day, setDay] = useState(String(parts.getDate()));
  const [month, setMonth] = useState(String(parts.getMonth() + 1));
  const [year, setYear] = useState(String(parts.getFullYear()));

  useEffect(() => {
    setDay(String(parts.getDate()));
    setMonth(String(parts.getMonth() + 1));
    setYear(String(parts.getFullYear()));
  }, [purchaseDate]);

  const flush = (d: string, m: string, y: string) => {
    const dn = Number(d.replace(/[^\d]/g, ''));
    const mn = Number(m.replace(/[^\d]/g, ''));
    const yn = Number(y.replace(/[^\d]/g, ''));
    if (dn > 0 && mn > 0 && yn >= 2000 && yn <= 2100) {
      const { fromDateParts, toDateOnly } = require('../lib/date');
      const next = fromDateParts(yn, mn - 1, dn);
      if (next && next <= toDateOnly(new Date())) {
        onChange(next);
      }
    }
  };

  return (
    <View style={styles.dateInputs}>
      <TextInput
        style={styles.datePartInput}
        keyboardType="number-pad"
        value={day}
        onChangeText={v => { setDay(v); flush(v, month, year); }}
        onBlur={() => setDay(String(parts.getDate()))}
        accessibilityLabel="Day"
        maxLength={2}
      />
      <Text style={styles.datePartSep}>/</Text>
      <TextInput
        style={styles.datePartInput}
        keyboardType="number-pad"
        value={month}
        onChangeText={v => { setMonth(v); flush(day, v, year); }}
        onBlur={() => setMonth(String(parts.getMonth() + 1))}
        accessibilityLabel="Month"
        maxLength={2}
      />
      <Text style={styles.datePartSep}>/</Text>
      <TextInput
        style={[styles.datePartInput, styles.dateYearInput]}
        keyboardType="number-pad"
        value={year}
        onChangeText={v => { setYear(v); flush(day, month, v); }}
        onBlur={() => setYear(String(parts.getFullYear()))}
        accessibilityLabel="Year"
        maxLength={4}
      />
    </View>
  );
}

export default function ConfirmScreen() {
  const params = useLocalSearchParams<{
    items?: string;
    merchantName?: string;
    receiptId?: string;
    receiptTotal?: string;
    tax?: string;
    serviceCharge?: string;
    discount?: string;
    sourceType?: string;
    purchaseDate?: string;
    dateExtracted?: string;
    hadParsingIssues?: string;
    imageUri?: string;
  }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const isEditMode = !!params.receiptId;
  const fromScan = !!params.items && !isEditMode;

  const [items, setItems] = useState<EditableReceiptItem[]>(() => {
    const parsed = parseScannedItems(params.items);
    if (parsed.length > 0) return parsed;
    return isEditMode ? [] : [createBlankItem()];
  });
  const [merchantName, setMerchantName] = useState(params.merchantName ?? '');
  const [tax, setTax] = useState(Number(params.tax) || 0);
  const [serviceCharge, setServiceCharge] = useState(Number(params.serviceCharge) || 0);
  const [discount, setDiscount] = useState(Number(params.discount) || 0);
  const extractedDate = parsePurchaseDate(params.purchaseDate);
  const isFromScan = !!params.items && !isEditMode;
  // If it's a new scan and AI couldn't find a date, leave it blank to force user review.
  const [purchaseDate, setPurchaseDate] = useState(extractedDate ?? (isFromScan ? '' : todayDateOnly()));
  const [dateExtracted, setDateExtracted] = useState(params.dateExtracted === '1' && !!extractedDate);
  const [showDateEditor, setShowDateEditor] = useState(!extractedDate && isFromScan);
  const [ocrTotal] = useState<number | null>(() => parseOptionalTotal(params.receiptTotal));
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>(
    (params.sourceType as SourceType) || 'receipt'
  );
  const hadParsingIssues = params.hadParsingIssues === '1';

  const initialCategoriesRef = useRef<Record<string, string>>({});
  const initialMerchantRef = useRef<string>(params.merchantName ?? '');
  const [prefLoaded, setPrefLoaded] = useState(false);

  useEffect(() => {
    // Populate initial ref for manual edit tracking
    if (Object.keys(initialCategoriesRef.current).length === 0 && items.length > 0) {
      items.forEach(item => {
        initialCategoriesRef.current[item.localId] = item.category;
      });
    }
  }, [items]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  // Apply Merchant Preference
  useEffect(() => {
    let isActive = true;
    async function applyPref() {
      if (!isFromScan || !merchantName || prefLoaded) return;
      const prefCategory = await getMerchantPreference(db, merchantName);
      if (prefCategory && isActive) {
        setItems(prev => prev.map(item => ({ ...item, category: prefCategory })));
        // Update the initial categories ref so we know THIS was the starting point
        // before user interaction, avoiding prompting them if they don't change it.
        initialCategoriesRef.current = {};
      }
      if (isActive) setPrefLoaded(true);
    }
    applyPref();
    return () => { isActive = false; };
  }, [db, isFromScan, merchantName, prefLoaded]);

  useFocusEffect(
    useCallback(() => {
      if (!isEditMode || !params.receiptId) return;
      let isActive = true;
      async function load() {
        try {
          const detail = await getReceiptDetail(db, params.receiptId!);
          if (detail && isActive) {
            if (detail.isSharedExpense) {
              Alert.alert(
                'Cannot Edit Shared Expense', 
                'This receipt has been modified to only reflect your personal portion. To change it, please delete this receipt and scan it again.',
                [{ text: 'OK', onPress: () => router.back() }]
              );
              return;
            }

            setItems(
              detail.items.map((item) => ({
                localId: randomUUID(),
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                category: item.category,
                lineTotal: item.lineTotal,
              }))
            );
            setMerchantName(detail.merchantName ?? '');
            setTax(detail.tax ?? 0);
            setServiceCharge(detail.serviceCharge ?? 0);
            setDiscount(detail.discount ?? 0);
            const existingDate = parsePurchaseDate(detail.purchaseDate) ?? todayDateOnly();
            setPurchaseDate(existingDate);
            setDateExtracted(true);
            setSourceType((detail.sourceType as SourceType) || 'receipt');
            setIsLoading(false);
          } else if (isActive) {
            setIsLoading(false);
            Alert.alert('Not Found', 'This receipt could not be loaded.', [
              { text: 'OK', onPress: () => router.back() },
            ]);
          }
        } catch {
          if (isActive) {
            setIsLoading(false);
            Alert.alert('Could not load receipt', 'Please go back and try again.');
          }
        }
      }
      load();
      return () => {
        isActive = false;
      };
    }, [db, params.receiptId, isEditMode, router])
  );

  const itemsTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const previousItemsTotalRef = useRef(itemsTotal);

  useEffect(() => {
    const prev = previousItemsTotalRef.current;
    if (prev > 0 && itemsTotal > 0 && itemsTotal !== prev) {
      const ratio = itemsTotal / prev;
      setTax((t) => Math.round(t * ratio));
      setServiceCharge((s) => Math.round(s * ratio));
      setDiscount((d) => Math.round(d * ratio));
    } else if (itemsTotal === 0 && prev > 0) {
      setTax(0);
      setServiceCharge(0);
      setDiscount(0);
    }
    previousItemsTotalRef.current = itemsTotal;
  }, [itemsTotal]);

  const total = calculatedReceiptTotal({ items, tax, serviceCharge, discount });
  const reconciliation = fromScan ? reconcileTotals(total, ocrTotal) : { status: 'ocr_missing' as const, difference: 0 };
  const isSuspiciousTax =
    fromScan &&
    tax > 0 &&
    itemsTotal > 0 &&
    ((tax <= 30 && itemsTotal >= 1000) || (itemsTotal >= 10000 && tax / itemsTotal < 0.01));

  function updateItem(localId: string, field: 'name' | 'price' | 'quantity' | 'lineTotal', value: string) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.localId !== localId) return item;
        if (field === 'name') return { ...item, name: value };
        if (field === 'quantity') {
          const quantity = parseQuantityInput(value);
          return { ...item, quantity, lineTotal: roundRupiah(item.price * quantity) };
        }
        if (field === 'price') {
          const price = parseRupiahInput(value);
          return { ...item, price, lineTotal: roundRupiah(price * item.quantity) };
        }
        const lineTotal = parseRupiahInput(value);
        return { ...item, lineTotal, price: item.quantity > 0 ? Math.round(lineTotal / item.quantity) : lineTotal };
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

  function shiftDate(days: number) {
    const next = shiftDateOnly(purchaseDate, days, new Date());
    if (!next) return;
    setPurchaseDate(next);
    setDateExtracted(true);
  }

  function handleDatePartChange(part: 'day' | 'month' | 'year', raw: string) {
    const digits = raw.replace(/[^\d]/g, '');
    const n = Number(digits);
    if (!Number.isFinite(n) || digits.length === 0) return;
    if (part === 'year' && digits.length !== 4) return;
    const next = applyDatePart(purchaseDate, part, n, new Date());
    if (!next) return;
    setPurchaseDate(next);
    setDateExtracted(true);
  }

  async function handleSave() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (itemsTotal <= 0) {
      Alert.alert('No Items', 'Add at least one item before saving.');
      return;
    }
    const invalid = items.find(
      (item) => item.name.trim().length === 0 || item.lineTotal <= 0 || item.quantity <= 0
    );
    if (invalid) {
      Alert.alert('Check Your Items', 'Every item needs a name, a quantity above 0, and a line total above 0.');
      return;
    }
    if (!parsePurchaseDate(purchaseDate)) {
      Alert.alert('Check the Date', 'Set the purchase date before saving.');
      return;
    }

    const persist = async () => {
      setIsSaving(true);
      try {
        if (isEditMode && params.receiptId) {
          await updateReceipt(
            db,
            params.receiptId,
            purchaseDate,
            items,
            merchantName.trim() || null,
            tax,
            serviceCharge,
            sourceType,
            discount
          );
        } else {
          await saveReceipt(
            db,
            purchaseDate,
            items,
            merchantName.trim() || null,
            tax,
            serviceCharge,
            sourceType,
            discount,
            params.imageUri
          );
        }

        const finalMerchant = merchantName.trim();
        const performNavigate = () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowToast(true);
          toastTimeoutRef.current = setTimeout(() => {
            if (isEditMode && params.receiptId) {
              router.replace(`/receipt/${params.receiptId}`);
            } else {
              router.dismissAll();
            }
          }, 800);
        };

        if (finalMerchant) {
          let anyChanged = false;
          const finalCategories = new Set(items.map(i => i.category));
          
          for (const item of items) {
            const initialCat = initialCategoriesRef.current[item.localId];
            if (initialCat && initialCat !== item.category) {
              anyChanged = true;
            }
          }
          
          if (anyChanged && finalCategories.size === 1) {
            const finalCategory = items[0].category;
            const existingPref = await getMerchantPreference(db, finalMerchant);
            
            if (existingPref !== finalCategory) {
              const isUpdate = !!existingPref;
              setIsSaving(false); // Stop loading indicator while alert is showing
              Alert.alert(
                isUpdate ? `Update ${finalMerchant} preference?` : 'Remember this?',
                `Use ${finalCategory.toUpperCase()} for future ${finalMerchant} transactions?`,
                [
                  { text: 'Not Now', style: 'cancel', onPress: performNavigate },
                  { text: isUpdate ? 'Update' : 'Remember', style: 'default', onPress: async () => {
                      await saveMerchantPreference(db, finalMerchant, finalCategory);
                      performNavigate();
                  }}
                ]
              );
              return;
            }
          }
        }

        performNavigate();
      } catch (err) {
        console.error('[confirm.tsx] Save error:', err);
        setIsSaving(false);
        const message = err instanceof Error ? err.message : 'Could not save this receipt. Please try again.';
        Alert.alert('Save Failed', message);
      }
    };

    if (fromScan && reconciliation.status === 'mismatch') {
      Alert.alert(
        'Totals do not match',
        `Receipt total: ${formatRupiah(ocrTotal ?? 0)}\nYour total: ${formatRupiah(total)}\nDifference: ${formatRupiah(Math.abs(reconciliation.difference))}\n\nYou can go back and edit, or save your version.`,
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Save anyway', onPress: persist },
        ]
      );
      return;
    }

    await persist();
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
          onPress: () => router.back(),
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
  const dateParts = dateOnlyToDate(purchaseDate);
  const sourceMeta = DOCUMENT_TYPE_META[sourceType] ?? DOCUMENT_TYPE_META.receipt;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <View style={styles.modalHeader}>
        <View style={styles.dragIndicator} />
        <View style={styles.modalHeaderContent}>
          <TouchableOpacity onPress={handleCancel} hitSlop={{top:10, bottom:10, left:10, right:10}}>
            <Text style={styles.cancelHeaderText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{isEditMode ? 'Edit Receipt' : 'Review Items'}</Text>
          <View style={{ width: 45 }} />
        </View>
      </View>
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
        {fromScan && (
          <View style={styles.trustBanner}>
            <Ionicons name="document-text-outline" size={16} color={colors.textPrimary} />
            <Text style={styles.trustBannerText}>
              Extracted from receipt. Please verify before saving.
            </Text>
          </View>
        )}

        {hadParsingIssues && fromScan && (
          <View style={styles.warningBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
            <Text style={styles.warningBannerText}>
              Some lines could not be read confidently. Please double-check names, quantities, and amounts.
            </Text>
          </View>
        )}

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>RECEIPT</Text>
          <View style={[styles.merchantCard, fromScan && !merchantName.trim() && styles.dateCardFallback]}>
            <TextInput
              style={styles.merchantInput}
              value={merchantName}
              onChangeText={setMerchantName}
              placeholder="Store or recipient name"
              placeholderTextColor="#94A3B8"
              accessibilityLabel="Merchant name"
            />
            {fromScan && !merchantName.trim() && (
              <Text style={styles.dateHint}>Not found on the document — tap to enter the name.</Text>
            )}
            <View style={styles.receiptMetaRow}>
              <TouchableOpacity
                style={styles.sourceChip}
                onPress={() => {
                  const order: SourceType[] = ['receipt', 'bank_transfer', 'ewallet', 'qris'];
                  const next = order[(order.indexOf(sourceType) + 1) % order.length];
                  setSourceType(next);
                }}
                accessibilityRole="button"
                accessibilityLabel="Document type"
              >
                <Ionicons name={sourceMeta.icon} size={12} color="#64748B" />
                <Text style={styles.sourceChipText}>{sourceMeta.label}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>PURCHASE DATE</Text>
          <TouchableOpacity
            style={[styles.dateCard, !dateExtracted && fromScan && styles.dateCardFallback]}
            onPress={() => setShowDateEditor((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="Purchase date"
          >
            <View>
              <Text style={styles.dateValue}>{formatPurchaseDate(purchaseDate)}</Text>
              <Text style={styles.dateHint}>
                {dateExtracted
                  ? 'Found on document'
                  : fromScan
                    ? "Couldn't find the date, please set one."
                    : 'Tap to change'}
              </Text>
            </View>
            <Ionicons name="calendar-outline" size={18} color="#64748B" />
          </TouchableOpacity>
          {showDateEditor && (
            <View style={styles.dateEditor}>
              <TouchableOpacity onPress={() => shiftDate(-1)} accessibilityLabel="Previous day" style={styles.dateStepBtn}>
                <Ionicons name="chevron-back" size={18} color="#0F172A" />
              </TouchableOpacity>
              <DateEditorInputs purchaseDate={purchaseDate} onChange={(v) => { setPurchaseDate(v); setDateExtracted(true); }} styles={styles} />
              <TouchableOpacity onPress={() => shiftDate(1)} accessibilityLabel="Next day" style={styles.dateStepBtn}>
                <Ionicons name="chevron-forward" size={18} color="#0F172A" />
              </TouchableOpacity>
            </View>
          )}
        </View>

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
              const itemLooksWrong = item.name.trim().length === 0 || item.lineTotal <= 0 || item.quantity <= 0;

              return (
                <Swipeable key={item.localId} renderRightActions={() => renderRightActions(item.localId)}>
                  <View
                    style={[
                      styles.itemRow,
                      isFirst && styles.itemRowFirst,
                      isLast && styles.itemRowLast,
                      !isLast && styles.itemRowBorder,
                      itemLooksWrong && styles.itemRowProblem,
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
                        onPress={() => setPickerTargetId(item.localId)}
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
                          value={item.quantity === 0 ? '' : String(item.quantity)}
                          onChangeText={(v) => updateItem(item.localId, 'quantity', v)}
                          keyboardType="number-pad"
                          accessibilityLabel="Quantity"
                        />
                      </View>
                      <Text style={styles.multiplySign}>×</Text>
                      <View style={styles.priceWrap}>
                        <Text style={styles.currencySymbol}>Rp</Text>
                        <TextInput
                          style={styles.priceInput}
                          value={item.price === 0 ? '' : String(item.price)}
                          onChangeText={(v) => updateItem(item.localId, 'price', v)}
                          keyboardType="number-pad"
                          accessibilityLabel="Unit price"
                        />
                      </View>
                      <View style={styles.lineTotalWrap}>
                        <Text style={styles.currencySymbol}>Rp</Text>
                        <TextInput
                          style={styles.lineTotalInput}
                          value={item.lineTotal === 0 ? '' : String(item.lineTotal)}
                          onChangeText={(v) => updateItem(item.localId, 'lineTotal', v)}
                          keyboardType="number-pad"
                          accessibilityLabel="Line total"
                        />
                      </View>
                    </View>
                  </View>
                </Swipeable>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>CALCULATION</Text>
          <View style={styles.summaryContainer}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <AnimatedNumber value={itemsTotal} formatter={formatRupiah} style={styles.summaryValue} />
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tax (Pajak / PB1 / PPN)</Text>
              <View style={[styles.chargeInputRow, isSuspiciousTax && styles.chargeInputRowWarning]}>
                <Text style={styles.currencyPrefix}>Rp</Text>
                <TextInput
                  style={styles.chargeInput}
                  value={tax === 0 ? '' : String(tax)}
                  onChangeText={(v) => setTax(parseRupiahInput(v))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>
            {isSuspiciousTax && (
              <Text style={styles.suspiciousTaxHint}>
                Tax amount (Rp{tax}) looks unusually low or like a percentage rate. Please check and adjust if needed.
              </Text>
            )}

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Service Charge</Text>
              <View style={styles.chargeInputRow}>
                <Text style={styles.currencyPrefix}>Rp</Text>
                <TextInput
                  style={styles.chargeInput}
                  value={serviceCharge === 0 ? '' : String(serviceCharge)}
                  onChangeText={(v) => setServiceCharge(parseRupiahInput(v))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Discount</Text>
              <View style={styles.chargeInputRow}>
                <Text style={styles.currencyPrefix}>Rp</Text>
                <TextInput
                  style={styles.chargeInput}
                  value={discount === 0 ? '' : String(discount)}
                  onChangeText={(v) => setDiscount(parseRupiahInput(v))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Your total</Text>
              <AnimatedNumber value={total} formatter={formatRupiah} style={styles.totalValue} />
            </View>

            {fromScan && reconciliation.status === 'match' && ocrTotal !== null && (
              <View style={styles.matchBadge}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Text style={styles.matchHintText}>
                  Total matches receipt ({formatRupiah(ocrTotal)})
                </Text>
              </View>
            )}

            {fromScan && reconciliation.status === 'small_difference' && ocrTotal !== null && (
              <View style={styles.smallDiffContainer}>
                <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
                <Text style={styles.smallDiffText}>
                  Off by {formatRupiah(Math.abs(reconciliation.difference))} ({reconciliation.difference > 0 ? '+' : '-'}{formatRupiah(Math.abs(reconciliation.difference))} vs printed {formatRupiah(ocrTotal)}) — check tax, discount, or items
                </Text>
              </View>
            )}

            {fromScan && reconciliation.status === 'ocr_missing' && (
              <Text style={styles.missingHint}>No printed total was found. Confirm the amount above.</Text>
            )}

            {fromScan && reconciliation.status === 'mismatch' && ocrTotal !== null && (
              <View style={styles.mismatchBox}>
                <Text style={styles.mismatchTitle}>Totals do not match</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Receipt total</Text>
                  <Text style={styles.summaryValue}>{formatRupiah(ocrTotal)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Calculated total</Text>
                  <Text style={styles.summaryValue}>{formatRupiah(total)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.mismatchDiffLabel}>Difference</Text>
                  <Text style={styles.mismatchDiffValue}>{formatRupiah(Math.abs(reconciliation.difference))}</Text>
                </View>
                <Text style={styles.mismatchHint}>Neither number is changed automatically. Edit the items, or save your version.</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button
          label={isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Receipt'}
          onPress={handleSave}
          loading={isSaving}
        />
        <TouchableOpacity style={styles.discardButton} onPress={handleCancel} disabled={isSaving} activeOpacity={0.7}>
          <Text style={styles.discardButtonText}>{isEditMode ? 'Discard Changes' : 'Discard Receipt'}</Text>
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
  modalHeader: {
    backgroundColor: '#FAFAFA',
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  dragIndicator: {
    width: 36,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  modalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.md,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  cancelHeaderText: {
    ...typography.body,
    color: colors.primary,
  },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 30 },
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
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.md,
  },
  trustBannerText: {
    flex: 1,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.md,
  },
  warningBannerText: {
    flex: 1,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
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
  receiptMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceChipText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    color: '#64748B',
    letterSpacing: 0.3,
  },
  dateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateCardFallback: {
    borderColor: colors.warning,
    backgroundColor: '#FFFBEB',
  },
  dateValue: {
    ...typography.numberPrimary,
  },
  dateHint: {
    ...typography.caption,
    marginTop: 2,
    paddingRight: 12,
  },
  dateEditor: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateStepBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateInputs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePartInput: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: '#0F172A',
    minWidth: 28,
    textAlign: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  dateYearInput: { minWidth: 56 },
  datePartSep: {
    marginHorizontal: 6,
    color: '#94A3B8',
    fontFamily: 'Manrope_700Bold',
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
  itemRowProblem: {
    backgroundColor: '#FFFBEB',
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
    ...typography.caption,
    marginRight: 2,
  },
  priceInput: {
    ...typography.numberSecondary,
    minWidth: 58,
    padding: 0,
  },
  multiplySign: {
    ...typography.caption,
    marginHorizontal: 8,
  },
  lineTotalWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lineTotalInput: {
    ...typography.numberPrimary,
    fontSize: 15,
    minWidth: 64,
    textAlign: 'right',
    padding: 0,
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
    ...typography.caption,
  },
  summaryValue: {
    ...typography.numberSecondary,
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
    ...typography.caption,
    marginRight: 4,
  },
  chargeInput: {
    ...typography.numberSecondary,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalLabel: { ...typography.h3 },
  totalValue: { ...typography.numberPrimary },
  chargeInputRowWarning: {
    borderColor: colors.warning,
    backgroundColor: '#FFFBEB',
  },
  suspiciousTaxHint: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    color: '#92400E',
    marginTop: -4,
    marginBottom: 6,
    lineHeight: 15,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  matchHintText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#166534',
  },
  smallDiffContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#FFFBEB',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  smallDiffText: {
    flex: 1,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
  },
  missingHint: {
    marginTop: 8,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#64748B',
  },
  mismatchBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
  },
  mismatchTitle: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 13,
    color: colors.error,
    marginBottom: 6,
  },
  mismatchDiffLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: colors.error,
  },
  mismatchDiffValue: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 14,
    color: colors.error,
  },
  mismatchHint: {
    marginTop: 8,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
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
