export const CATEGORIES = [
  'Food & Drink',
  'Groceries',
  'Transport',
  'Health',
  'Entertainment',
  'Shopping',
  'Bills',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

// Palet direvisi supaya setiap kategori punya jarak hue yang jelas satu
// sama lain (sebelumnya Transport & Entertainment sama-sama di rentang
// ungu/indigo dan sulit dibedakan sekilas). Warna juga diselaraskan dengan
// brand palette baru (indigo primary + terracotta accent).
export const CATEGORY_META: Record<Category, { color: string; icon: string }> = {
  'Food & Drink': { color: '#E8734A', icon: 'fast-food' },
  Groceries: { color: '#3F9142', icon: 'basket' },
  Transport: { color: '#2A9D8F', icon: 'car' },
  Health: { color: '#D64550', icon: 'medkit' },
  Entertainment: { color: '#8B5CF6', icon: 'film' },
  Shopping: { color: '#2F6FED', icon: 'bag' },
  Bills: { color: '#E0A72E', icon: 'receipt' },
  Other: { color: '#8A8578', icon: 'ellipsis-horizontal' },
};

export function getCategoryMeta(category: string) {
  return CATEGORY_META[category as Category] ?? CATEGORY_META.Other;
}
