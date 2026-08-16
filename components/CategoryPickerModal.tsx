import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES, getCategoryMeta } from '../constants/categories';
import { colors, spacing, radius } from '../constants/theme';

interface CategoryPickerModalProps {
  visible: boolean;
  selectedCategory?: string;
  onSelect: (category: string) => void;
  onClose: () => void;
}

export default function CategoryPickerModal({
  visible,
  selectedCategory,
  onSelect,
  onClose,
}: CategoryPickerModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalCard}>
              <View style={styles.header}>
                <Text style={styles.title}>Select Category</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <FlatList
                data={CATEGORIES}
                keyExtractor={(item) => item}
                renderItem={({ item }) => {
                  const meta = getCategoryMeta(item);
                  const isSelected = item === selectedCategory;
                  return (
                    <TouchableOpacity
                      style={[styles.categoryRow, isSelected && styles.categoryRowSelected]}
                      onPress={() => {
                        onSelect(item);
                        onClose();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.categoryIconWrap, { backgroundColor: meta.color + '15' }]}>
                        <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                      </View>
                      <Text style={[styles.categoryName, isSelected && styles.categoryNameSelected]}>
                        {item}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark" size={18} color={colors.primary} style={styles.checkIcon} />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />

              <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  categoryRowSelected: {
    backgroundColor: '#F8FAFC',
    borderRadius: radius.sm,
  },
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  categoryName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  categoryNameSelected: {
    color: colors.primary,
  },
  checkIcon: {
    marginLeft: spacing.xs,
  },
  cancelButton: {
    marginTop: spacing.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: radius.md,
  },
  cancelButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: colors.textSecondary,
  },
});
