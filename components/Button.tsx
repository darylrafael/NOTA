import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, GestureResponderEvent, ViewStyle } from 'react-native';
import { colors, radius, spacing, shadow } from '../constants/theme';

interface ButtonProps {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function Button({ label, onPress, variant = 'primary', loading, disabled, style }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.textOnPrimary : colors.primary} />
      ) : (
        <Text style={[styles.label, variant === 'primary' ? styles.labelPrimary : styles.labelSecondary]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    // Pill-shaped sebagai signature CTA - membedakan NOTA dari rounded-rect
    // generik yang dipakai hampir semua template finance app.
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
  },
  primary: { backgroundColor: colors.primary, ...shadow.tinted },
  secondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
  disabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  labelPrimary: { color: colors.textOnPrimary },
  labelSecondary: { color: colors.primary },
});
