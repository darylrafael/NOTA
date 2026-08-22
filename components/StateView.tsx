import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../constants/theme';
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
  tertiaryLabel?: string;
  onTertiaryPress?: () => void;
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
  tertiaryLabel,
  onTertiaryPress,
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

      {tertiaryLabel && onTertiaryPress && (
        <TouchableOpacity onPress={onTertiaryPress} style={styles.tertiaryLink} accessibilityRole="button">
          <Text style={styles.tertiaryLinkText}>{tertiaryLabel}</Text>
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
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
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
  secondaryLinkText: { ...typography.body, color: colors.primary },
  tertiaryLink: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  tertiaryLinkText: { ...typography.body, color: colors.textSecondary },
});
