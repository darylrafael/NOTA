import { ParsedReceiptItem, GeminiExtractionResult, SourceType, ExtractionWarning } from '../types/receipt';
import { MAX_LINE_TOTAL, MAX_QUANTITY, MAX_RECEIPT_TOTAL, roundRupiah } from './money';
import { parsePurchaseDate } from './date';
import { calculatedReceiptTotal, displayUnitPrice, reconcileTotals } from './receiptMath';

const SOURCE_TYPES: SourceType[] = ['receipt', 'bank_transfer', 'ewallet', 'qris'];

export function parseAndValidateExtraction(rawText: string): GeminiExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('MALFORMED_JSON');
  }

  const root = asRecord(parsed);
  if (!root || !Array.isArray(root.items)) {
    throw new Error('UNEXPECTED_FORMAT');
  }

  const warnings: ExtractionWarning[] = [];
  let clamped = false;

  const merchantName = typeof root.merchantName === 'string' ? root.merchantName.trim() : '';
  if (!merchantName) warnings.push('missing_merchant');

  const sourceType: SourceType =
    typeof root.sourceType === 'string' && SOURCE_TYPES.includes(root.sourceType as SourceType)
      ? (root.sourceType as SourceType)
      : 'receipt';

  const purchaseDate = parsePurchaseDate(typeof root.purchaseDate === 'string' ? root.purchaseDate : null);
  const dateExtracted = purchaseDate !== null;
  if (!dateExtracted) warnings.push('missing_date');

  const items: ParsedReceiptItem[] = [];
  let skippedItems = false;
  let extractedNegativeItemsSum = 0;

  for (const rawItem of root.items) {
    const item = asRecord(rawItem);
    if (!item) {
      skippedItems = true;
      continue;
    }

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const rawLineTotal = firstNumber(item.lineTotal, item.price);
    const rawQty = Number(item.quantity);
    const rawUnit = firstNumber(item.unitPrice);

    if (name.length === 0 || rawLineTotal === null || !Number.isFinite(rawLineTotal)) {
      skippedItems = true;
      continue;
    }

    let lineTotal = roundRupiah(rawLineTotal);
    if (lineTotal < 0) {
      extractedNegativeItemsSum += Math.abs(lineTotal);
      skippedItems = true;
      continue;
    }
    if (lineTotal === 0) {
      skippedItems = true;
      continue;
    }
    if (lineTotal > MAX_LINE_TOTAL) {
      lineTotal = MAX_LINE_TOTAL;
      clamped = true;
    }

    let quantity = 1;
    if (Number.isFinite(rawQty) && rawQty > 0) {
      quantity = Math.round(rawQty);
    } else {
      skippedItems = true;
    }
    if (quantity < 1) quantity = 1;
    if (quantity > MAX_QUANTITY) {
      quantity = MAX_QUANTITY;
      clamped = true;
    }

    let unitPrice =
      rawUnit !== null && rawUnit > 0 ? roundRupiah(rawUnit) : displayUnitPrice(lineTotal, quantity);
    if (unitPrice < 0) unitPrice = displayUnitPrice(lineTotal, quantity);
    if (unitPrice > MAX_LINE_TOTAL) {
      unitPrice = MAX_LINE_TOTAL;
      clamped = true;
    }

    items.push({ name, unitPrice, quantity, lineTotal });
  }

  if (items.length === 0) {
    throw new Error('NO_VALID_ITEMS');
  }
  if (skippedItems) warnings.push('partial_items');
  if (clamped) warnings.push('clamped_values');

  const receiptTotalRaw = firstNumber(root.receiptTotal);
  let receiptTotal: number | null = null;
  if (receiptTotalRaw !== null && receiptTotalRaw > 0 && Number.isFinite(receiptTotalRaw)) {
    receiptTotal = roundRupiah(receiptTotalRaw);
    if (receiptTotal > MAX_RECEIPT_TOTAL) {
      receiptTotal = MAX_RECEIPT_TOTAL;
      clamped = true;
      if (!warnings.includes('clamped_values')) warnings.push('clamped_values');
    }
  } else {
    warnings.push('missing_total');
  }

  const tax = sanitizeCharge(firstNumber(root.tax), () => {
    clamped = true;
  });
  const serviceCharge = sanitizeCharge(firstNumber(root.serviceCharge), () => {
    clamped = true;
  });
  let discount = sanitizeCharge(firstNumber(root.discount), () => {
    clamped = true;
  });
  
  if (extractedNegativeItemsSum > 0) {
    // If the root discount perfectly matches the sum of negative items, it's double-counted.
    // Otherwise, we sum them, and let the reconciliation engine flag any mismatch.
    if (discount === extractedNegativeItemsSum) {
      // Do nothing, it's already captured in discount
    } else {
      discount += extractedNegativeItemsSum;
    }
  }
  if (clamped && !warnings.includes('clamped_values')) warnings.push('clamped_values');

  const itemsSubtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  // Multi-signal sanity check for tax extraction:
  // 1. Likely percentage rate mistakenly parsed as nominal rupiah (e.g. tax = 8 or 10 or 11 when subtotal >= 1000)
  // 2. Unusually tiny tax ratio (<1% when subtotal is substantial)
  // 3. Unusually excessive tax ratio (>35% when subtotal is substantial)
  if (tax > 0 && itemsSubtotal > 0) {
    const taxRatio = tax / itemsSubtotal;
    const isLikelyPercentage = tax <= 30 && itemsSubtotal >= 1000;
    const isUnusuallyTiny = itemsSubtotal >= 10000 && taxRatio < 0.01;
    const isUnusuallyHuge = itemsSubtotal >= 10000 && taxRatio > 0.35;

    if (isLikelyPercentage || isUnusuallyTiny || isUnusuallyHuge) {
      warnings.push('suspicious_tax');
    }
  }

  const calculated = calculatedReceiptTotal({ items, tax, serviceCharge, discount });
  if (reconcileTotals(calculated, receiptTotal).status === 'mismatch') {
    warnings.push('total_mismatch');
  }

  return {
    items,
    hadParsingIssues: warnings.some((w) => w !== 'total_mismatch' && w !== 'missing_date'),
    merchantName,
    receiptTotal,
    tax,
    serviceCharge,
    discount,
    sourceType,
    purchaseDate,
    dateExtracted,
    warnings,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const n = Number(value.replace(/,/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function sanitizeCharge(value: number | null, onClamp: () => void): number {
  if (value === null || !Number.isFinite(value) || value < 0) {
    if (value !== null && value < 0) onClamp();
    return 0;
  }
  const rounded = roundRupiah(value);
  if (rounded > MAX_RECEIPT_TOTAL) {
    onClamp();
    return MAX_RECEIPT_TOTAL;
  }
  return rounded;
}
