import { roundRupiah } from './money';

/** Totals within this many rupiah are treated as consistent (OCR noise). */
export const TOTAL_MATCH_TOLERANCE = 100;

export function sumLineTotals(items: { lineTotal: number }[]): number {
  return items.reduce((sum, item) => sum + roundRupiah(item.lineTotal), 0);
}

export function calculatedReceiptTotal(input: {
  items: { lineTotal: number }[];
  tax: number;
  serviceCharge: number;
  discount?: number;
}): number {
  return roundRupiah(
    sumLineTotals(input.items) +
      roundRupiah(input.tax) +
      roundRupiah(input.serviceCharge) -
      roundRupiah(input.discount ?? 0)
  );
}

export function allocateReceiptTotalByCategory(
  items: { category: string; lineTotal: number }[],
  receiptTotal: number
): { category: string; amount: number }[] {
  const categorySubtotals = new Map<string, number>();

  for (const item of items) {
    const category = item.category.trim() || 'Other';
    categorySubtotals.set(category, (categorySubtotals.get(category) ?? 0) + roundRupiah(item.lineTotal));
  }

  const subtotals = Array.from(categorySubtotals, ([category, amount]) => ({ category, amount }));
  const subtotal = subtotals.reduce((sum, item) => sum + item.amount, 0);
  if (subtotal <= 0) return [];

  const adjustment = roundRupiah(receiptTotal) - subtotal;
  let allocatedAmount = 0;

  return subtotals.map((item, index) => {
    const isLastCategory = index === subtotals.length - 1;
    const share = isLastCategory
      ? adjustment - allocatedAmount
      : roundRupiah((adjustment * item.amount) / subtotal);
    allocatedAmount += share;
    return { category: item.category, amount: item.amount + share };
  });
}

export type ReconciliationStatus = 'match' | 'small_difference' | 'mismatch' | 'ocr_missing';

export function reconcileTotals(
  calculated: number,
  ocrTotal: number | null
): { status: ReconciliationStatus; difference: number } {
  if (ocrTotal === null || !Number.isFinite(ocrTotal)) {
    return { status: 'ocr_missing', difference: 0 };
  }
  const ocr = roundRupiah(ocrTotal);
  const calculatedSafe = roundRupiah(calculated);
  const difference = calculatedSafe - ocr;
  if (difference === 0) {
    return { status: 'match', difference: 0 };
  }
  if (Math.abs(difference) <= TOTAL_MATCH_TOLERANCE) {
    return { status: 'small_difference', difference };
  }
  return { status: 'mismatch', difference };
}

/**
 * Display-only unit price. Never used to reconstruct a saved line total.
 * If the line total divides evenly, keep the exact integer; otherwise round.
 */
export function displayUnitPrice(lineTotal: number, quantity: number): number {
  const qty = quantity > 0 ? quantity : 1;
  const total = roundRupiah(lineTotal);
  if (total % qty === 0) return total / qty;
  return Math.round(total / qty);
}
