import { useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, ScrollView, Modal, KeyboardAvoidingView, Platform, TouchableWithoutFeedback } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecurringRules, getRecurringSuggestions, addRecurringRule, updateRecurringRule, deleteRecurringRule, RecurringSuggestion } from '../../db/queries';
import { RecurringRule } from '../../types/receipt';
import { formatRupiah, toTitleCase } from '../../lib/format';
import { getCategoryMeta, CATEGORIES } from '../../constants/categories';
import { colors, spacing, radius, typography } from '../../constants/theme';
import Button from '../../components/Button';
import { formatPurchaseDate } from '../../lib/date';

export default function RecurringScreen() {
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const router = useRouter();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [suggestions, setSuggestions] = useState<RecurringSuggestion[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<RecurringRule>>({});
  const [tempAmount, setTempAmount] = useState('');
  
  // For yearly rules, splitting the integer into MM and DD for UI
  const [yearlyMonth, setYearlyMonth] = useState('1');
  const [yearlyDay, setYearlyDay] = useState('1');
  const [tempBillingDate, setTempBillingDate] = useState('');

  const loadData = useCallback(async () => {
    const [fetchedRules, fetchedSuggestions] = await Promise.all([
      getRecurringRules(db),
      getRecurringSuggestions(db),
    ]);
    setRules(fetchedRules);
    setSuggestions(fetchedSuggestions);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  function handleAdd() {
    setEditingRule({
      name: '',
      amount: 0,
      category: 'Bills',
      billing_date: 1,
      is_active: 1,
      frequency: 'monthly'
    });
    setTempAmount('');
    setTempBillingDate('');
    setYearlyMonth('');
    setYearlyDay('');
    setIsEditorOpen(true);
  }

  function handleEdit(rule: RecurringRule) {
    setEditingRule({ ...rule });
    setTempAmount(rule.amount ? String(rule.amount) : '');
    if (rule.frequency === 'yearly') {
      const m = Math.floor(rule.billing_date / 100);
      const d = rule.billing_date % 100;
      setYearlyMonth(String(m || ''));
      setYearlyDay(String(d || ''));
      setTempBillingDate('');
    } else {
      setTempBillingDate(String(rule.billing_date || ''));
      setYearlyMonth('');
      setYearlyDay('');
    }
    setIsEditorOpen(true);
  }

  function handleAcceptSuggestion(sug: RecurringSuggestion) {
    const d = new Date(sug.lastDate);
    const dateNum = isNaN(d.getDate()) ? 1 : d.getDate();
    setEditingRule({
      name: toTitleCase(sug.name),
      amount: sug.amount,
      category: sug.category,
      billing_date: dateNum,
      is_active: 1,
      frequency: 'monthly'
    });
    setTempAmount(String(sug.amount));
    setTempBillingDate(String(dateNum));
    setYearlyMonth('');
    setYearlyDay('');
    setIsEditorOpen(true);
  }

  async function handleSave() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const parsedAmount = Number(tempAmount.replace(/\D/g, '')) || 0;
    
    if (!editingRule.name || !editingRule.name.trim() || !parsedAmount) {
        Alert.alert('Validation Error', 'Please enter a valid name and amount.');
        return;
      }
      if (!editingRule.category) {
        Alert.alert('Validation Error', 'Please select a category.');
        return;
      }

    let finalBillingDate = 0;
    if (editingRule.frequency === 'yearly') {
      const m = parseInt(yearlyMonth, 10);
      const d = parseInt(yearlyDay, 10);
      if (isNaN(m) || m < 1 || m > 12 || isNaN(d) || d < 1 || d > 31) {
        Alert.alert('Validation Error', 'Please enter a valid month (1-12) and day (1-31).');
        return;
      }
      finalBillingDate = m * 100 + d;
    } else if (editingRule.frequency === 'weekly') {
      const d = parseInt(tempBillingDate, 10);
      if (isNaN(d) || d < 1 || d > 7) {
        Alert.alert('Validation Error', 'Please enter a valid day of the week (1-7).');
        return;
      }
      finalBillingDate = d;
    } else {
      const d = parseInt(tempBillingDate, 10);
      if (tempBillingDate.trim() === '') {
          Alert.alert('Validation Error', 'Enter a billing date.');
          return;
        }
        if (isNaN(d) || d < 1 || d > 31) {
          Alert.alert('Validation Error', 'Billing date must be between 1 and 31.');
          return;
        }
      finalBillingDate = d;
    }
    
    const finalRule = { ...editingRule, amount: parsedAmount, billing_date: finalBillingDate };
    
    if (finalRule.id) {
      await updateRecurringRule(db, finalRule.id, finalRule);
    } else {
      await addRecurringRule(db, finalRule as Omit<RecurringRule, 'id' | 'created_at' | 'updated_at'>);
    }
    setIsEditorOpen(false);
    loadData();
  }

  function handleToggle(rule: RecurringRule) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (rule.is_active) {
      Alert.alert(
        `Pause ${toTitleCase(rule.name)}?`,
        `Future ${toTitleCase(rule.name)} bills will no longer appear until you resume this rule.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Pause Rule', style: 'destructive', onPress: async () => {
            await updateRecurringRule(db, rule.id, { is_active: 0 });
            loadData();
          }}
        ]
      );
    } else {
      Alert.alert(
        `Resume ${toTitleCase(rule.name)}?`,
        `This rule will immediately start generating bills again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Resume Rule', onPress: async () => {
            await updateRecurringRule(db, rule.id, { is_active: 1 });
            loadData();
          }}
        ]
      );
    }
  }

  function handleDeleteConfirm(id: string) {
    Alert.alert(
      `Delete ${editingRule.name} rule?`, 
      `This will stop future recurring bills.\nYour past ${editingRule.name} transactions will remain.`, 
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteRecurringRule(db, id);
          setIsEditorOpen(false);
          loadData();
        }}
      ]
    );
  }

  function getOrdinalSuffix(n: number) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function formatDisplayDate(rule: RecurringRule) {
    if (rule.frequency === 'weekly') {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      return `Every ${days[(rule.billing_date - 1) % 7] || 'Monday'}`;
    }
    if (rule.frequency === 'yearly') {
      const m = Math.floor(rule.billing_date / 100);
      const d = rule.billing_date % 100;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${d} ${months[m - 1] || 'Jan'}`;
    }
    return `${getOrdinalSuffix(rule.billing_date)}`;
  }

  const renderRule = ({ item }: { item: RecurringRule }) => {
    const meta = getCategoryMeta(item.category);
    const titleCaseName = toTitleCase(item.name);
    return (
      <View style={styles.card}>
        <View style={[styles.iconBox, { backgroundColor: meta.color + '15' }]}>
          <Ionicons name={meta.icon as any} size={20} color={meta.color} />
        </View>
        <TouchableOpacity style={styles.cardContent} onPress={() => handleEdit(item)}>
          <Text style={[styles.cardTitle, item.is_active === 0 && { color: colors.textTertiary, textDecorationLine: 'line-through' }]} numberOfLines={1}>{titleCaseName}</Text>
          <Text style={styles.cardSubtitle}>
            {item.frequency === 'weekly' ? 'Weekly' : item.frequency === 'yearly' ? 'Yearly' : 'Monthly'} {'\u00B7'} {formatDisplayDate(item)}
            {(() => {
              if (!item.last_paid_date) return '\nNo payment recorded yet';
              const d = new Date(item.last_paid_date);
              const now = new Date();
              if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
                return '\nPaid this month';
              }
              return `\nLast paid: ${formatPurchaseDate(item.last_paid_date)}`;
            })()}
          </Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
          <Text style={styles.cardAmount}>{formatRupiah(item.amount)}</Text>
          <TouchableOpacity 
            style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center' }}
            onPress={() => handleToggle(item)}
          >
            <Ionicons name={item.is_active ? 'pause-circle-outline' : 'play-circle-outline'} size={16} color={item.is_active ? colors.textSecondary : colors.primary} />
            <Text style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: item.is_active ? colors.textSecondary : colors.primary, marginLeft: 4 }}>
              {item.is_active ? 'Pause' : 'Resume'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSuggestion = ({ item }: { item: RecurringSuggestion }) => {
    const meta = getCategoryMeta(item.category);
    const titleCaseName = toTitleCase(item.name);
    
    // Calculate approximate days apart
    let contextText = `Detected ${item.occurrences} times`;
    if (item.firstDate && item.lastDate && item.firstDate !== item.lastDate) {
      const msDiff = new Date(item.lastDate).getTime() - new Date(item.firstDate).getTime();
      const daysDiff = Math.round(msDiff / (1000 * 60 * 60 * 24));
      const avgGap = Math.round(daysDiff / Math.max(1, item.occurrences - 1));
      if (avgGap > 0) {
        contextText += ` \u00B7 ~${avgGap} days apart`;
      }
    }

    return (
      <View style={styles.card}>
        <View style={[styles.iconBox, { backgroundColor: meta.color + '15', alignSelf: 'flex-start' }]}>
            <Ionicons name="sparkles" size={20} color={meta.color} />
          </View>
          <View style={styles.cardContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={[styles.cardTitle, { flex: 1, marginRight: 8 }]} numberOfLines={1}>{titleCaseName}</Text>
              <Text style={styles.cardAmount}>{formatRupiah(item.amount)}</Text>
            </View>
            <Text style={[styles.cardSubtitle, { marginTop: 4, marginBottom: 12 }]}>{contextText}</Text>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity 
                style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.primary }}
                onPress={() => handleAcceptSuggestion(item)}
              >
                <Text style={{ fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#FFF' }}>Add Rule</Text>
              </TouchableOpacity>
            </View>
          </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Recurring Bills', headerShown: true, headerBackTitle: 'Back' }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Rules</Text>
            {rules.length > 0 && (
              <Text style={{ fontFamily: 'Manrope_500Medium', fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                {rules.filter(r => r.is_active).length} active {'\u00B7'} {formatRupiah(rules.filter(r => r.is_active).reduce((sum, r) => sum + r.amount, 0))}/month
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={handleAdd} style={styles.addButton}>
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
        
        {rules.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No recurring rules yet.</Text>
          </View>
        ) : (
          rules.map(r => <View key={r.id}>{renderRule({ item: r })}</View>)
        )}

        {suggestions.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
              <Text style={styles.sectionTitle}>Suggested for You</Text>
            </View>
            {suggestions.map((s, i) => <View key={i}>{renderSuggestion({ item: s })}</View>)}
          </>
        )}
      </ScrollView>

      <Modal visible={isEditorOpen} transparent animationType="slide" onRequestClose={() => setIsEditorOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={() => setIsEditorOpen(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} />
          </TouchableWithoutFeedback>
          <View style={{ backgroundColor: colors.background, padding: spacing.xl, paddingBottom: spacing.xl + insets.bottom, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '90%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={styles.sectionTitle}>{editingRule.id ? 'Edit Rule' : 'New Rule'}</Text>
              <TouchableOpacity onPress={() => setIsEditorOpen(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
              <Text style={styles.label}>Name</Text>
              <TextInput style={styles.input} value={editingRule.name} onChangeText={t => setEditingRule({ ...editingRule, name: t })} placeholder="e.g. Spotify" placeholderTextColor={colors.textTertiary} />
              
              <Text style={styles.label}>Amount (IDR)</Text>
              <TextInput 
                style={styles.input} 
                value={tempAmount ? formatRupiah(Number(tempAmount.replace(/\D/g, ''))) : ''} 
                onChangeText={t => setTempAmount(t.replace(/\D/g, ''))} 
                placeholder="Rp0" placeholderTextColor={colors.textTertiary} 
                keyboardType="numeric" 
              />
              
              <Text style={styles.label}>Frequency</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                {['weekly', 'monthly', 'yearly'].map(freq => (
                  <TouchableOpacity 
                    key={freq} 
                    style={[styles.freqChip, editingRule.frequency === freq && styles.freqChipActive]}
                    onPress={() => setEditingRule({ ...editingRule, frequency: freq })}
                  >
                    <Text style={[styles.freqChipText, editingRule.frequency === freq && styles.freqChipTextActive]}>
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {editingRule.frequency === 'yearly' ? (
                <>
                  <Text style={styles.label}>Billing Date (Month & Day)</Text>
                  <View style={{ flexDirection: 'row', gap: spacing.md }}>
                    <TextInput 
                      style={[styles.input, { flex: 1 }]} 
                      value={yearlyMonth} 
                      onChangeText={t => setYearlyMonth(t.replace(/\D/g, ''))} 
                      placeholder="MM (1-12)" 
                      keyboardType="numeric" 
                    />
                    <TextInput 
                      style={[styles.input, { flex: 1 }]} 
                      value={yearlyDay} 
                      onChangeText={t => setYearlyDay(t.replace(/\D/g, ''))} 
                      placeholder="DD (1-31)" 
                      keyboardType="numeric" 
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.label}>
                    {editingRule.frequency === 'weekly' ? 'Billing Day (1=Mon, 7=Sun)' : 'Billing Date (1-31)'}
                  </Text>
                  <TextInput 
                    style={styles.input} 
                    value={tempBillingDate} 
                    onChangeText={t => setTempBillingDate(t.replace(/\D/g, ''))} 
                    placeholder={editingRule.frequency === 'weekly' ? '1-7 (Mon-Sun)' : '1-31'} 
                    keyboardType="numeric" 
                  />
                </>
              )}

              <Text style={styles.label}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs, paddingBottom: spacing.xs }}>
                {CATEGORIES.map(cat => {
                  const meta = getCategoryMeta(cat);
                  return (
                    <TouchableOpacity 
                      key={cat} 
                      style={[styles.catChip, editingRule.category === cat && styles.catChipActive, editingRule.category === cat && { backgroundColor: meta.color + '15' }]}
                      onPress={() => setEditingRule({ ...editingRule, category: cat })}
                    >
                      <Ionicons name={meta.icon as any} size={14} color={editingRule.category === cat ? meta.color : colors.textSecondary} />
                      <Text style={[styles.catChipText, editingRule.category === cat && { color: meta.color, fontFamily: 'Manrope_700Bold' }]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ height: spacing.lg }} />
              <Button label="Save Rule" onPress={handleSave} variant="primary" />
              {editingRule.id && (
                <TouchableOpacity onPress={() => handleDeleteConfirm(editingRule.id!)} style={{ marginTop: spacing.md, alignItems: 'center', paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.errorBg }}>
                  <Text style={{ fontFamily: 'Manrope_700Bold', fontSize: 15, color: colors.error }}>Delete Rule</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.xl, paddingBottom: spacing.xxl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionTitle: { ...typography.h3 },
  addButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  addButtonText: { fontFamily: 'Manrope_600SemiBold', color: '#FFF', marginLeft: 4, fontSize: 13 },
  emptyBox: { padding: spacing.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  emptyText: { ...typography.body, color: colors.textTertiary },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  iconBox: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  cardContent: { flex: 1 },
  cardTitle: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: colors.textPrimary },
  cardSubtitle: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  cardAmount: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: colors.textPrimary },
  editor: { paddingBottom: spacing.xxl },
  label: { ...typography.label, marginBottom: spacing.xs, marginTop: spacing.md },
  input: { borderWidth: 1, borderColor: (colors as any).borderInput || '#D1D5DB', borderRadius: radius.md, padding: spacing.md, ...typography.body, backgroundColor: colors.surface, minHeight: 48 },
  freqChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  freqChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  freqChipText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: colors.textSecondary },
  freqChipTextActive: { fontFamily: 'Manrope_700Bold', color: colors.primary },
  catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  catChipActive: { borderColor: 'transparent' },
  catChipText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: colors.textSecondary, marginLeft: 6 },
});
