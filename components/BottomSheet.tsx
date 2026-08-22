import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '../constants/theme';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Option {
  key: string;
  label: string;
}

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  options: Option[];
  selectedValue: string;
  onSelect: (key: string) => void;
  title?: string;
}

export default function BottomSheet({
  visible,
  onClose,
  options,
  selectedValue,
  onSelect,
  title = 'Select Option',
}: BottomSheetProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 25,
          stiffness: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible && slideAnim.interpolate({ inputRange: [0, SCREEN_HEIGHT], outputRange: [0, 1] }) as unknown as number === 1) {
    // Wait for unmount to avoid clipping, or just rely on visible prop for modal
  }

  const handleSelect = (key: string) => {
    if (key !== selectedValue) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(key);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.sheetContainer,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={styles.handle} />
        
        <Text style={styles.title}>{title}</Text>
        
        <View style={styles.optionsContainer}>
          {options.map((option) => {
            const isSelected = option.key === selectedValue;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.optionRow, isSelected && styles.optionRowActive]}
                onPress={() => handleSelect(option.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                  {option.label}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        
        <TouchableOpacity style={styles.cancelButton} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: 12,
    paddingBottom: 40, // Safe area
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h4,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  optionsContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionRowActive: {
    backgroundColor: colors.accentMuted,
  },
  optionLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  optionLabelActive: {
    fontFamily: 'Manrope_700Bold',
    color: colors.accent,
  },
  cancelButton: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cancelText: {
    ...typography.body,
    fontFamily: 'Manrope_700Bold',
    color: colors.textPrimary,
  },
});
