import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../constants/theme';
import Button from './Button';

interface StateViewProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconTone?: 'neutral' | 'error';
  title: string;
  subtitle: string;
  primaryLabel?: string;
  onPrimaryPress?: () => void;
  primaryLoading?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
}

export default function StateView({
  icon,
  iconTone = 'neutral',
  title,
  subtitle,
  primaryLabel,
  onPrimaryPress,
  primaryLoading,
  secondaryLabel,
  onSecondaryPress,
}: StateViewProps) {
  const iconBg = iconTone === 'error' ? colors.errorBg : colors.primaryMuted;
  const iconColor = iconTone === 'error' ? colors.error : colors.primary;

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={36} color={iconColor} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {primaryLabel && onPrimaryPress && (
        <View style={styles.primaryButtonWrap}>
          <Button label={primaryLabel} onPress={onPrimaryPress} loading={primaryLoading} />
        </View>
      )}

      {secondaryLabel && onSecondaryPress && (
        <TouchableOpacity onPress={onSecondaryPress} style={styles.secondaryLink} accessibilityRole="button">
          <Text style={styles.secondaryLinkText}>{secondaryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.background,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 19,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.xl,
    maxWidth: 280,
  },
  primaryButtonWrap: { width: '100%', maxWidth: 320 },
  secondaryLink: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  secondaryLinkText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: colors.primary },
});
