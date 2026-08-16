// Safety net: the Gemini prompt already instructs the model to exclude
// total/subtotal/tax/change rows, but this filter catches cases where the
// model includes them anyway. Matching is on the full normalized name
// (not substring) to avoid accidentally dropping a real item whose name
// happens to contain one of these words.
const NON_EXPENSE_NAMES = [
  'subtotal',
  'tax',
  'service charge',
  'total',
  'kembalian',
  'tunai',
  'pajak',
  'diskon',
];

export function filterNonExpenseItems<T extends { name: string }>(items: T[]): T[] {
  return items.filter((item) => {
    const normalized = item.name.trim().toLowerCase().replace(/:$/, '');
    return !NON_EXPENSE_NAMES.includes(normalized);
  });
}
