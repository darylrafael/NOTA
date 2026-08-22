import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Modal,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ONBOARDING_KEY } from '../constants/onboarding';
import { getCategoryMeta } from '../constants/categories';
import { colors, radius, spacing, shadow, typography } from '../constants/theme';

const { width } = Dimensions.get('window');

// Unify the onboarding pages to use the app's standard dark theme
const HERO_DARK = colors.primary;

const DOT_THEMES = [
  { active: '#fff', inactive: 'rgba(255,255,255,0.3)' },
  { active: colors.primary, inactive: colors.border },
  { active: '#fff', inactive: 'rgba(255,255,255,0.35)' },
];

// ---------- Page 1: Snap your receipt ----------
function ReceiptPage() {
  const items = [
    { name: 'Kuah Mala Susu', price: 'Rp88.000' },
    { name: 'US Shortplate', price: 'Rp112.000' },
    { name: 'Pork Belly', price: 'Rp68.000' },
    { name: 'Mushroom Platter', price: 'Rp45.000' },
    { name: 'Kulit Tahu Goreng', price: 'Rp28.000' },
    { name: 'Ice Lemon Tea', price: 'Rp20.000' },
  ];
  return (
    <View style={[p1.page, { width }]}>
      <View style={p1.textBlock}>
        <Text style={p1.title}>Snap your receipt</Text>
        <Text style={p1.subtitle}>Take a photo and NOTA reads every item automatically</Text>
      </View>

      <View style={p1.receiptStage}>
        <View style={p1.flashDot} />
        <View style={p1.receiptCard}>
          <Text style={p1.receiptStore}>HAIDILAO</Text>
          <Text style={p1.receiptMeta}>{`Grand Indonesia \u00B7 Table 12`}</Text>
          <View style={p1.receiptDivider} />
          {items.map((row) => (
            <View key={row.name} style={p1.receiptRow}>
              <Text style={p1.receiptItemName}>{row.name}</Text>
              <Text style={p1.receiptItemPrice}>{row.price}</Text>
            </View>
          ))}
          <View style={p1.receiptDivider} />
          <View style={p1.receiptRow}>
            <Text style={p1.receiptTotalLabel}>Total</Text>
            <Text style={p1.receiptTotalValue}>Rp361.000</Text>
          </View>
        </View>
        <View style={p1.scallopRow}>
          {Array.from({ length: 14 }).map((_, i) => (
            <View key={i} style={p1.scallop} />
          ))}
        </View>
      </View>
    </View>
  );
}

const p1 = StyleSheet.create({
  page: { flex: 1, backgroundColor: HERO_DARK, paddingTop: 88, paddingHorizontal: 32 },
  textBlock: { marginBottom: 30 },
  title: { ...typography.h1, color: colors.textOnPrimary, marginBottom: 10 },
  subtitle: { ...typography.body, color: colors.textTertiary, lineHeight: 22, maxWidth: 260 },
  receiptStage: { alignItems: 'center' },
  flashDot: {
    position: 'absolute',
    top: -6,
    left: 18,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffd60a',
    zIndex: 5,
  },
  receiptCard: {
    width: 236,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: spacing.md,
    transform: [{ rotate: '-5deg' }],
    ...shadow.raised,
  },
  receiptStore: { ...typography.h4, textAlign: 'center' },
  receiptMeta: { ...typography.caption, textAlign: 'center', marginTop: 2, marginBottom: 8 },
  receiptDivider: { height: 1, backgroundColor: colors.border, marginVertical: 7 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2.5 },
  receiptItemName: { ...typography.bodySecondary },
  receiptItemPrice: { ...typography.bodySecondary },
  receiptTotalLabel: { ...typography.h4 },
  receiptTotalValue: { ...typography.numberSecondary, color: colors.primary },
  scallopRow: {
    flexDirection: 'row',
    width: 236,
    marginTop: -8,
    justifyContent: 'space-between',
    paddingHorizontal: 3,
    transform: [{ rotate: '-5deg' }],
  },
  scallop: { width: 15, height: 15, borderRadius: 8, backgroundColor: HERO_DARK },
});

// ---------- Page 2: Review & confirm ----------
function ConfirmPage() {
  const items = [
    { name: 'Bakso', category: 'Food & Drink', price: 'Rp24.000' },
    { name: 'Grab Ride', category: 'Transport', price: 'Rp18.000' },
    { name: 'Indomaret', category: 'Groceries', price: 'Rp42.000' },
  ];
  return (
    <View style={[p2.page, { width }]}>
      <View style={p2.frameWrap}>
        <View style={p2.frame}>
          {items.map((item) => {
            const meta = getCategoryMeta(item.category);
            return (
              <View key={item.name} style={p2.row}>
                <View style={p2.rowTop}>
                  <Text style={p2.name}>{item.name}</Text>
                  <Text style={p2.price}>{item.price}</Text>
                </View>
                <View style={[p2.badge, { backgroundColor: meta.color + '22' }]}>
                  <Text style={[p2.badgeText, { color: meta.color }]}>{item.category}</Text>
                </View>
              </View>
            );
          })}
          <View style={p2.saveButton}>
            <Text style={p2.saveText}>Save</Text>
          </View>
        </View>
        <View style={p2.checkBadge}>
          <Text style={p2.checkMark}>{'\u2713'}</Text>
        </View>
      </View>

      <View style={p2.textBlock}>
        <Text style={p2.title}>Review & confirm</Text>
        <Text style={p2.subtitle}>Fix mistakes, change categories, then save with one tap</Text>
      </View>
    </View>
  );
}

const p2 = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  frameWrap: { marginBottom: 32 },
  frame: {
    width: 250,
    backgroundColor: colors.background,
    borderRadius: 20,
    borderWidth: 6,
    borderColor: '#111',
    padding: 14,
  },
  row: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10, marginBottom: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  name: { ...typography.bodySecondary, color: colors.textPrimary },
  price: { ...typography.bodySecondary, color: colors.textPrimary },
  badge: { alignSelf: 'flex-start', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { ...typography.label },
  saveButton: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 11, alignItems: 'center', marginTop: 2 },
  saveText: { ...typography.h4, color: colors.textOnPrimary },
  checkBadge: {
    position: 'absolute',
    top: -14,
    right: -14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  checkMark: { color: colors.textOnPrimary, fontSize: 20, fontWeight: '800' },
  textBlock: { width: 250 },
  title: { ...typography.h1 },
  subtitle: { ...typography.body, color: colors.textSecondary, lineHeight: 21, marginTop: 8 },
});

// ---------- Page 3: See where it goes ----------
function ForecastPage() {
  const bars = [
    { label: 'Food & Drink', percent: 0.9, color: '#F7B99C' },
    { label: 'Transport', percent: 0.55, color: 'rgba(255,255,255,0.35)' },
    { label: 'Groceries', percent: 0.35, color: 'rgba(255,255,255,0.35)' },
  ];
  return (
    <View style={[p3.page, { width }]}>
      <View style={p3.textBlock}>
        <Text style={p3.title}>See where it goes</Text>
        <Text style={p3.subtitle}>NOTA forecasts your spending so you're never surprised</Text>
      </View>

      <View style={p3.statRow}>
        <Text style={p3.statAmount}>Rp850.000</Text>
        <Text style={p3.statLabel}>top category this month</Text>
      </View>

      <View style={p3.chartCard}>
        {bars.map((bar) => (
          <View key={bar.label} style={p3.barRow}>
            <Text style={p3.barLabel}>{bar.label}</Text>
            <View style={p3.barTrack}>
              <View style={[p3.barFill, { width: `${bar.percent * 100}%`, backgroundColor: bar.color }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const p3 = StyleSheet.create({
  page: { flex: 1, backgroundColor: HERO_DARK, paddingTop: 90, paddingHorizontal: 28 },
  textBlock: { marginBottom: 28 },
  title: { ...typography.h1, color: colors.textOnPrimary, marginBottom: 8 },
  subtitle: { ...typography.body, color: colors.textTertiary, lineHeight: 21, maxWidth: 270 },
  statRow: { marginBottom: 20 },
  statAmount: { ...typography.numberHero, color: colors.textOnPrimary },
  statLabel: { ...typography.bodySecondary, color: colors.textTertiary, marginTop: 2 },
  chartCard: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 18,
    padding: 20,
    marginTop: 'auto',
    marginBottom: 130,
  },
  barRow: { marginBottom: 14 },
  barLabel: { ...typography.bodySecondary, color: colors.textOnPrimary, marginBottom: 5 },
  barTrack: { height: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
});

// ---------- Shared shell: skip, dots, get started, swipe logic ----------
const PAGES = [ReceiptPage, ConfirmPage, ForecastPage];
const PAGE_BG = [HERO_DARK, colors.surface, HERO_DARK];
const SKIP_COLOR = [colors.textOnPrimary, colors.textPrimary, colors.textOnPrimary];

export default function OnboardingOverlay({ onComplete }: { onComplete: () => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const dotTheme = DOT_THEMES[page];

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    onComplete();
  }

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  return (
    <Modal visible animationType="slide" presentationStyle="overFullScreen">
      <View style={[styles.overlay, { backgroundColor: PAGE_BG[page] }]}>
        {page < 2 && (
          <TouchableOpacity style={styles.skipButton} onPress={finish}>
            <Text style={[styles.skipText, { color: SKIP_COLOR[page] }]}>Skip</Text>
          </TouchableOpacity>
        )}

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
        >
          {PAGES.map((PageComponent, i) => (
            <PageComponent key={i} />
          ))}
        </ScrollView>

        <View style={styles.dotsRow}>
          {PAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === page ? dotTheme.active : dotTheme.inactive },
                i === page && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {page === 2 && (
          <TouchableOpacity style={styles.getStartedButton} onPress={finish}>
            <Text style={styles.getStartedText}>Get Started</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  skipButton: { position: 'absolute', top: 60, right: 20, zIndex: 10 },
  skipText: { ...typography.h4 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 4 },
  dotActive: { width: 20 },
  getStartedButton: {
    backgroundColor: colors.surface,
    marginHorizontal: 32,
    marginBottom: 50,
    paddingVertical: 16,
    borderRadius: radius.pill,
    alignItems: 'center',
    ...shadow.raised,
  },
  getStartedText: { ...typography.h4, color: colors.primary },
});
