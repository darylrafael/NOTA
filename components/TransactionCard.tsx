import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '../constants/theme';
import { getCategoryMeta } from '../constants/categories';
import { formatRupiah } from '../lib/format';
import Swipeable from 'react-native-gesture-handler/Swipeable';

interface TransactionCardProps {
  id: string;
  merchantName: string;
  dateDisplay: string;
  primaryCategory: string;
  totalAmount: number;
  onPress: () => void;
  onDelete?: (id: string) => void;
}

export default function TransactionCard({
  id,
  merchantName,
  dateDisplay,
  primaryCategory,
  totalAmount,
  onPress,
  onDelete,
}: TransactionCardProps) {
  const meta = getCategoryMeta(primaryCategory);

  const renderContent = () => (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: meta.color + '15' }]}>
        <Ionicons name={meta.icon as any} size={20} color={meta.color} />
      </View>

      <View style={styles.content}>
        <Text style={styles.merchantName} numberOfLines={1}>
          {merchantName}
        </Text>
        <Text style={styles.metadata} numberOfLines={1}>
          {dateDisplay} · {primaryCategory}
        </Text>
      </View>

      <View style={styles.rightContent}>
        <Text style={styles.amount}>{formatRupiah(totalAmount)}</Text>
      </View>
    </TouchableOpacity>
  );

  if (onDelete) {
    const renderRightActions = () => (
      <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(id)}>
        <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
        <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
    );
    return (
      <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
        {renderContent()}
      </Swipeable>
    );
  }

  return renderContent();
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    height: 72,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  merchantName: {
    ...typography.body,
    fontFamily: 'Manrope_700Bold',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  metadata: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rightContent: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  amount: {
    ...typography.numberSecondary,
    color: colors.textPrimary,
  },
  deleteButton: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: 72,
  },
  deleteText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
    marginTop: 4,
  },
});
