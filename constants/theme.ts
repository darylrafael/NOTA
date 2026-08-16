// NOTA design tokens - v2
// Palet baru: deep indigo sebagai primary (menggantikan iOS-blue generik),
// terracotta sebagai warm accent, background off-white hangat konsisten
// di seluruh layar. Radius dibuat berskala (bukan satu angka untuk semua)
// supaya ritme visual antar elemen terasa disengaja.

export const colors = {
  primary: '#000000', // Stark black for high contrast (Vercel style)
  primaryDark: '#111111',
  primaryMuted: '#F3F4F6',
  accent: '#3B82F6', // Blue for interactive elements
  accentMuted: '#EFF6FF',
  background: '#FAFAFA', // Very light gray, not pure white
  surface: '#FFFFFF',
  border: '#E5E7EB', // Subtle gray border
  textPrimary: '#111827', // Almost black
  textSecondary: '#6B7280', // Gray for secondary info
  textTertiary: '#9CA3AF',
  textOnPrimary: '#FFFFFF',
  error: '#EF4444',
  errorBg: '#FEF2F2',
  success: '#10B981',
  successBg: '#ECFDF5',
  warning: '#F59E0B',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Skala radius bertingkat by hierarchy elemen - bukan satu nilai untuk semua.
export const radius = {
  xs: 6,    // chip / badge kategori kecil
  sm: 10,   // input, small controls
  md: 16,   // card standar (list item, form card)
  lg: 24,   // hero header, bottom sheet, modal besar
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: '#1C1B1F',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#241E4E',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  // Shadow bertinta warna primary - dipakai khusus untuk primary CTA button
  // supaya tombol punya "signature" alih-alih shadow abu-abu generik.
  tinted: {
    shadowColor: '#4338CA',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
};
