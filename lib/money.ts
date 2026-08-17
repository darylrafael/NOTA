/** Indonesian rupiah is treated as whole rupiah (no sen) throughout NOTA. */

export const MAX_LINE_TOTAL = 100_000_000;
export const MAX_RECEIPT_TOTAL = 500_000_000;
export const MAX_QUANTITY = 999;

export function roundRupiah(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

/** Parse user input. Dots and commas are treated as thousand separators, not decimals. */
export function parseRupiahInput(raw: string): number {
  const cleaned = raw.replace(/[^\d-]/g, '');
  if (cleaned === '' || cleaned === '-') return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function parseQuantityInput(raw: string): number {
  const cleaned = raw.replace(/[^\d]/g, '');
  if (cleaned === '') return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function isValidRupiah(value: number, max = MAX_LINE_TOTAL): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value >= 0 && value <= max;
}
