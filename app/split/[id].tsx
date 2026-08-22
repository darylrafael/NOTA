import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList, Dimensions, Animated, Modal, TouchableWithoutFeedback, TextInput, Alert, Share, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { randomUUID } from 'expo-crypto';

import { colors, radius, spacing } from '../../constants/theme';
import { formatRupiah } from '../../lib/format';
import { getReceiptDetail, ReceiptDetail } from '../../db/queries';
import { calculateSplitBill, SplitParticipant } from '../../lib/splitMath';
import StateView from '../../components/StateView';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PARTICIPANT_COLORS = [
  { bg: '#F1F5F9', text: '#0F172A', border: '#94A3B8' }, // Me (Prominent)
  { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
  { bg: '#FAF5FF', text: '#6B21A8', border: '#E9D5FF' },
  { bg: '#FFF7ED', text: '#9A3412', border: '#FED7AA' },
  { bg: '#FDF2F8', text: '#9D174D', border: '#FBCFE8' },
  { bg: '#F0FDFA', text: '#115E59', border: '#A7F3D0' },
];

export function getParticipantColor(index: number) {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
}

interface BottomSheetOption {
  id: string;
  label: string;
  sublabel?: string;
}

function MultiSelectBottomSheet({
  visible,
  onClose,
  title,
  onTitleChange,
  options,
  selectedIds,
  onToggle,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  onTitleChange?: (newTitle: string) => void;
  options: BottomSheetOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.sheetOverlay, { opacity: fadeAnim }]} />
      </TouchableWithoutFeedback>
      <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.sheetHandle} />
        {onTitleChange ? (
          <TextInput
            style={[styles.sheetTitle, { padding: 0, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', marginBottom: 16 }]}
            value={title}
            onChangeText={onTitleChange}
            placeholder="Name"
          />
        ) : (
          <Text style={styles.sheetTitle}>{title}</Text>
        )}
        
        <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.5 }}>
          {options.map((opt) => {
            const isSelected = selectedIds.includes(opt.id);
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.sheetOption, isSelected && styles.sheetOptionSelected]}
                onPress={() => {
                  Haptics.selectionAsync();
                  onToggle(opt.id);
                }}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={[styles.sheetOptionText, isSelected && styles.sheetOptionTextSelected]}>
                    {opt.label}
                  </Text>
                  {!!opt.sublabel && (
                    <Text style={[styles.sheetOptionSubtext, isSelected && styles.sheetOptionTextSelected]}>
                      {opt.sublabel}
                    </Text>
                  )}
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={styles.sheetFooter}>
          <TouchableOpacity style={styles.sheetDoneBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.sheetDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

export default function SplitBillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();

  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [participants, setParticipants] = useState<SplitParticipant[]>([
    { id: 'me', name: 'Me' },
    { id: randomUUID(), name: 'Friend 1' }
  ]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(null);
  
  const [showSummary, setShowSummary] = useState(false);
  const summarySlideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const summaryFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showSummary) {
      Animated.parallel([
        Animated.timing(summaryFadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(summarySlideAnim, { toValue: 0, duration: 300, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(summaryFadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(summarySlideAnim, { toValue: SCREEN_HEIGHT, duration: 300, useNativeDriver: true })
      ]).start();
    }
  }, [showSummary]);

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        const data = await getReceiptDetail(db, id);
        setReceipt(data);
      } catch (err) {
        console.error('Error loading receipt for split:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, db]);

  const splitSummary = useMemo(() => {
    if (!receipt) return null;
    return calculateSplitBill(receipt, participants, assignments);
  }, [receipt, participants, assignments]);

  const animateLayout = () => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        200,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity
      )
    );
  };

  const handleAddParticipant = () => {
    if (participants.length >= 10) return;
    animateLayout();
    setParticipants([...participants, { id: randomUUID(), name: `Friend ${participants.length}` }]);
  };

  const handleUpdateParticipantName = (pid: string, newName: string) => {
    setParticipants(participants.map(p => p.id === pid ? { ...p, name: newName } : p));
  };

  const handleRemoveParticipant = (pid: string) => {
    if (participants.length <= 2) {
      Alert.alert('Minimum Participants', 'You need at least 2 people to split a bill.');
      return;
    }
    Alert.alert('Remove Participant?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        animateLayout();
        setParticipants(participants.filter(p => p.id !== pid));
        const newAssignments = { ...assignments };
        for (const [itemId, pids] of Object.entries(newAssignments)) {
          newAssignments[itemId] = pids.filter(id => id !== pid);
        }
        setAssignments(newAssignments);
      }}
    ]);
  };

  const handleReset = () => {
    Alert.alert('Reset Split?', 'This will clear all assignments.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => {
        animateLayout();
        setAssignments({});
      }}
    ]);
  };

  const generateShareText = () => {
    if (!receipt || !splitSummary) return '';
    let text = `🍽️ Bill Split — ${receipt.merchantName || 'Store'}\n` +
               `📅 ${new Date(receipt.purchaseDate).toLocaleDateString()}\n\n`;
    
    for (const p of splitSummary.participants) {
      if (p.grandTotal === 0) continue;
      text += `${p.name}\n`;
      for (const item of p.items) {
        const fraction = item.shareDenominator > 1 ? ` (1/${item.shareDenominator})` : '';
        text += `• ${item.name}${fraction} — ${formatRupiah(item.allocatedAmount)}\n`;
      }
      if (p.tax > 0) text += `• Tax — ${formatRupiah(p.tax)}\n`;
      if (p.serviceCharge > 0) text += `• Service — ${formatRupiah(p.serviceCharge)}\n`;
      if (p.discount > 0) text += `• Discount — -${formatRupiah(p.discount)}\n`;
      text += `Total: ${formatRupiah(p.grandTotal)}\n\n`;
    }
    
    text += `Grand Total: ${formatRupiah(splitSummary.totalCalculated)}`;
    return text;
  };

  const handleCopy = async () => {
    const text = generateShareText();
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied!', 'The split bill summary has been copied to your clipboard.');
  };
  
  const handleShare = async () => {
    const text = generateShareText();
    try {
      await Share.share({ message: text });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <StateView icon="sync" title="Loading" subtitle="Loading receipt..." />;
  if (!receipt) return <StateView icon="document-outline" title="Not Found" subtitle="Couldn't load this receipt." />;

  const renderSummary = () => {
    if (!splitSummary) return null;

    if (!splitSummary.totalReconciled) {
      return (
        <Animated.View style={[StyleSheet.absoluteFill, styles.container, { paddingTop: insets.top, opacity: summaryFadeAnim, transform: [{ translateY: summarySlideAnim }] }]} pointerEvents={showSummary ? 'auto' : 'none'}>
          <StateView iconTone="error" icon="warning" title="Reconciliation Error" subtitle="We couldn't safely split this receipt. Please ensure all items are assigned." />
          <TouchableOpacity style={styles.backBtn} onPress={() => setShowSummary(false)}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    return (
      <Animated.View style={[StyleSheet.absoluteFill, styles.container, { paddingTop: insets.top, opacity: summaryFadeAnim, transform: [{ translateY: summarySlideAnim }] }]} pointerEvents={showSummary ? 'auto' : 'none'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowSummary(false)} style={styles.headerIcon}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Split Summary</Text>
          <View style={styles.headerIcon} />
        </View>

        <ScrollView contentContainerStyle={styles.summaryContent}>
          {splitSummary.participants.map(p => {
            if (p.grandTotal === 0) return null;
            return (
              <View key={p.participantId} style={styles.summaryCard}>
                <Text style={styles.summaryParticipantName}>{p.name}</Text>
                {p.items.map(item => (
                  <View key={item.itemId} style={styles.summaryRow}>
                    <Text style={styles.summaryItemName}>
                      {item.name} {item.shareDenominator > 1 ? `(1/${item.shareDenominator})` : ''}
                    </Text>
                    <Text style={styles.summaryItemAmount}>{formatRupiah(item.allocatedAmount)}</Text>
                  </View>
                ))}
                {(p.tax > 0 || p.serviceCharge > 0 || p.discount > 0) && <View style={styles.summaryDivider} />}
                {p.tax > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryMetaLabel}>Tax</Text>
                    <Text style={styles.summaryMetaAmount}>{formatRupiah(p.tax)}</Text>
                  </View>
                )}
                {p.serviceCharge > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryMetaLabel}>Service Charge</Text>
                    <Text style={styles.summaryMetaAmount}>{formatRupiah(p.serviceCharge)}</Text>
                  </View>
                )}
                {p.discount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryMetaLabel}>Discount</Text>
                    <Text style={styles.summaryMetaAmount}>-{formatRupiah(p.discount)}</Text>
                  </View>
                )}
                <View style={styles.summaryTotalRow}>
                  <Text style={styles.summaryTotalLabel}>Total</Text>
                  <Text style={styles.summaryTotalAmount}>{formatRupiah(p.grandTotal)}</Text>
                </View>
              </View>
            );
          })}
          
          <View style={styles.grandTotalContainer}>
            <Text style={styles.grandTotalLabel}>Grand Total</Text>
            <Text style={styles.grandTotalAmount}>{formatRupiah(splitSummary.totalCalculated)}</Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={styles.primaryActionBtn} onPress={handleCopy} activeOpacity={0.8}>
            <Ionicons name="copy-outline" size={18} color="#FFF" />
            <Text style={styles.primaryActionBtnText}>Copy Text</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryActionBtn} onPress={handleShare} activeOpacity={0.8}>
            <Ionicons name="share-outline" size={18} color={colors.primary} />
            <Text style={styles.secondaryActionBtnText}>Share via Apps</Text>
          </TouchableOpacity>

          <View style={styles.summaryFooterDivider} />
          
          <TouchableOpacity 
            style={styles.updateExpenseBtn} 
            onPress={async () => {
              const myPortion = splitSummary.participants.find(p => p.participantId === 'me');
              if (!myPortion) return;

              Alert.alert(
                'Update Your Expense?',
                `This will permanently remove your friends' items from this receipt. Your expense will be updated to ${formatRupiah(myPortion.grandTotal)}.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Update', style: 'destructive', onPress: async () => {
                    try {
                      const newItems = myPortion.items.map(i => {
                        const original = receipt.items.find(r => r.id === i.itemId)!;
                        return {
                          localId: randomUUID(),
                          name: i.shareDenominator > 1 ? `${original.name} (1/${i.shareDenominator})` : original.name,
                          price: i.allocatedAmount, // override price to match lineTotal for simplicity
                          quantity: 1, // override quantity
                          category: original.category,
                          lineTotal: i.allocatedAmount,
                        };
                      });
                      
                      const { convertToSharedExpense } = require('../../db/queries');
                      await convertToSharedExpense(db, receipt, newItems, {
                        totalAmount: myPortion.grandTotal,
                        tax: myPortion.tax,
                        serviceCharge: myPortion.serviceCharge,
                        discount: myPortion.discount
                      });
                      
                      router.back();
                    } catch (err) {
                      console.error(err);
                      Alert.alert('Error', 'Failed to update expense');
                    }
                  }}
                ]
              );
            }} 
            activeOpacity={0.8}
          >
            <Ionicons name="wallet-outline" size={18} color={colors.primary} />
            <Text style={styles.updateExpenseBtnText}>Save My Portion Only ({formatRupiah(splitSummary.participants.find(p => p.participantId === 'me')?.grandTotal || 0)})</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  const activeItem = activeItemId ? receipt.items.find(i => i.id === activeItemId) : null;
  const activeItemAssignments = activeItemId ? (assignments[activeItemId] || []) : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
          <Ionicons name="close" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Split Bill</Text>
        <TouchableOpacity onPress={handleReset} style={styles.headerIcon}>
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Participants List */}
      <View style={styles.participantsSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.participantsScroll}>
          {participants.map((p, index) => {
            const pColor = getParticipantColor(index);
            return (
              <TouchableOpacity 
                key={p.id} 
                style={[styles.participantPill, { backgroundColor: pColor.bg, borderColor: pColor.border }]}
                activeOpacity={0.7}
                onPress={() => {
                  setActiveParticipantId(p.id);
                  setActiveItemId(null);
                  setIsSheetVisible(true);
                }}
              >
                <Text style={[styles.participantInput, { color: pColor.text }]}>{p.name}</Text>
                <TouchableOpacity onPress={() => handleRemoveParticipant(p.id)} style={styles.participantRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={pColor.text} style={{ opacity: 0.3 }} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.addParticipantBtn} onPress={handleAddParticipant} activeOpacity={0.7}>
            <Ionicons name="add" size={16} color={colors.primary} />
            <Text style={styles.addParticipantText}>Add</Text>
          </TouchableOpacity>
        </ScrollView>
        
        {(() => {
          const totalItems = receipt.items.length;
          const assignedCount = receipt.items.filter(i => (assignments[i.id] || []).length > 0).length;
          const isComplete = assignedCount === totalItems;
          const percent = totalItems === 0 ? 0 : (assignedCount / totalItems) * 100;
          return (
            <View style={styles.progressContainer}>
              <Text style={styles.progressText}>
                {isComplete ? 'All items assigned' : `${assignedCount} / ${totalItems} items assigned`}
              </Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${percent}%`, backgroundColor: isComplete ? '#10B981' : colors.primary }]} />
              </View>
            </View>
          );
        })()}
      </View>

      {/* Items List */}
      <FlatList
        data={receipt.items}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.itemsList}
        renderItem={({ item }) => {
          const assignedIds = assignments[item.id] || [];
          const assignedParticipants = assignedIds.map(id => {
            const index = participants.findIndex(p => p.id === id);
            return { p: participants[index], index };
          }).filter(x => x.p);
          
          return (
            <TouchableOpacity
              style={styles.itemRow}
              activeOpacity={0.7}
              onPress={() => {
                setActiveItemId(item.id);
                setIsSheetVisible(true);
              }}
            >
              <View style={styles.itemLeft}>
                <Text style={[styles.itemName, assignedParticipants.length === 0 && { color: '#94A3B8' }]}>{item.name}</Text>
                {assignedParticipants.length > 0 ? (
                  <View style={styles.assignedTags}>
                    {assignedParticipants.map(({ p, index }, i) => {
                      const pColor = getParticipantColor(index);
                      return (
                        <View key={i} style={[styles.assignedTag, { backgroundColor: pColor.bg, borderColor: pColor.border }]}>
                          <Text style={[styles.assignedTagText, { color: pColor.text }]}>{p.name}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.unassignedText}>Tap to assign</Text>
                )}
              </View>
              <View style={styles.itemRight}>
                <Text style={styles.itemPrice}>{formatRupiah(item.lineTotal)}</Text>
                <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {splitSummary?.unassignedItemsCount ? (
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={16} color="#F59E0B" />
            <Text style={styles.warningText}>{splitSummary.unassignedItemsCount} items unassigned</Text>
          </View>
        ) : null}
        
        <TouchableOpacity 
          style={[styles.primaryActionBtn, splitSummary?.unassignedItemsCount ? styles.btnDisabled : {}]} 
          onPress={() => {
            if (splitSummary?.unassignedItemsCount === 0) {
              setShowSummary(true);
            } else {
              Alert.alert('Incomplete', 'Please assign all items before viewing summary.');
            }
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryActionBtnText}>View Summary</Text>
        </TouchableOpacity>
      </View>

      <MultiSelectBottomSheet
        visible={isSheetVisible}
        onClose={() => setIsSheetVisible(false)}
        title={
          activeItemId 
            ? activeItem?.name || 'Select' 
            : activeParticipantId 
              ? (participants.find(p => p.id === activeParticipantId)?.name || 'Select Items')
              : 'Select'
        }
        onTitleChange={
          activeParticipantId 
            ? (newTitle) => handleUpdateParticipantName(activeParticipantId, newTitle)
            : undefined
        }
        options={
          activeItemId
            ? participants.map(p => ({ id: p.id, label: p.name }))
            : activeParticipantId
              ? receipt.items.map(i => ({ id: i.id, label: i.name, sublabel: formatRupiah(i.lineTotal) }))
              : []
        }
        selectedIds={
          activeItemId
            ? activeItemAssignments
            : activeParticipantId
              ? receipt.items.filter(i => (assignments[i.id] || []).includes(activeParticipantId)).map(i => i.id)
              : []
        }
        onToggle={(id) => {
          animateLayout();
          if (activeItemId) {
            const current = assignments[activeItemId] || [];
            const updated = current.includes(id) ? current.filter(pid => pid !== id) : [...current, id];
            setAssignments({ ...assignments, [activeItemId]: updated });
          } else if (activeParticipantId) {
            const current = assignments[id] || [];
            const updated = current.includes(activeParticipantId) 
              ? current.filter(pid => pid !== activeParticipantId) 
              : [...current, activeParticipantId];
            setAssignments({ ...assignments, [id]: updated });
          }
        }}
      />
      {renderSummary()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
  },
  headerIcon: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#0F172A' },
  resetText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#EF4444' },
  
  participantsSection: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  participantsScroll: { paddingHorizontal: 16, gap: 8 },
  participantPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.pill,
    paddingLeft: 12,
    paddingRight: 6,
    height: 36,
  },
  participantInput: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#0F172A',
    minWidth: 40,
  },
  participantRemove: { padding: 4, marginLeft: 4 },
  addParticipantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    height: 36,
    gap: 4,
  },
  addParticipantText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: colors.primary },
  progressContainer: { paddingHorizontal: 16, marginTop: 16 },
  progressText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: '#64748B', marginBottom: 6 },
  progressBarBg: { height: 4, backgroundColor: '#F1F5F9', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 2 },

  itemsList: { padding: 16 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemLeft: { flex: 1, paddingRight: 16 },
  itemName: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0F172A', marginBottom: 6 },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemPrice: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#334155' },
  
  unassignedText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: '#94A3B8' },
  assignedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  assignedTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  assignedTagText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9', backgroundColor: '#FFF' },
  warningBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 },
  warningText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#F59E0B' },
  primaryActionBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  primaryActionBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFF' },
  secondaryActionBtn: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  secondaryActionBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: colors.primary },
  btnDisabled: { opacity: 0.5 },

  // Summary Styles
  summaryContent: { padding: 16 },
  summaryCard: { backgroundColor: '#F8FAFC', borderRadius: radius.md, padding: 16, marginBottom: 16 },
  summaryParticipantName: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#0F172A', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryItemName: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#334155', flex: 1 },
  summaryItemAmount: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#0F172A' },
  summaryDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 },
  summaryMetaLabel: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: '#64748B' },
  summaryMetaAmount: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: '#64748B' },
  summaryTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  summaryTotalLabel: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: '#0F172A' },
  summaryTotalAmount: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: '#0F172A' },
  
  grandTotalContainer: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, backgroundColor: '#0F172A', borderRadius: radius.md, marginTop: 8, marginBottom: 24 },
  grandTotalLabel: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#FFF' },
  grandTotalAmount: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#FFF' },
  backBtn: { marginTop: 24, padding: 16, alignItems: 'center' },
  backBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: colors.primary },

  summaryFooterDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 16,
  },
  updateExpenseBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: radius.md,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  updateExpenseBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: colors.primary },

  // Bottom Sheet
  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 10 },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: '#0F172A', marginBottom: 16, textAlign: 'center' },
  sheetOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  sheetOptionSelected: { backgroundColor: '#EFF6FF', marginHorizontal: -12, paddingHorizontal: 12, borderRadius: radius.md, borderBottomWidth: 0 },
  sheetOptionText: { fontFamily: 'Manrope_600SemiBold', fontSize: 16, color: '#334155' },
  sheetOptionSubtext: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#64748B', marginTop: 2 },
  sheetOptionTextSelected: { fontFamily: 'Manrope_700Bold', color: '#3B82F6' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center' },
  checkboxSelected: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  sheetFooter: { marginTop: 24 },
  sheetDoneBtn: { backgroundColor: colors.primary, borderRadius: radius.md, height: 50, justifyContent: 'center', alignItems: 'center' },
  sheetDoneBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#FFF' }
});
