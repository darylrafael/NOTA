import { EditableReceiptItem } from '../types/receipt';
import { MAX_LINE_TOTAL, MAX_QUANTITY, MAX_RECEIPT_TOTAL, roundRupiah } from './money';
import { parsePurchaseDate } from './date';
import { calculatedReceiptTotal } from './receiptMath';

export function validateReceiptWrite(input: {
  purchaseDate: string;
  items: EditableReceiptItem[];
  tax: number;
  serviceCharge: number;
  discount?: number;
}): { purchaseDate: string; tax: number; serviceCharge: number; discount: number; totalAmount: number } {
  if (input.items.length === 0) {
    throw new Error('A receipt must have at least one item.');
  }

  for (const item of input.items) {
    if (item.name.trim().length === 0) {
      throw new Error('Every item needs a name.');
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > MAX_QUANTITY) {
      throw new Error('Every item needs a quantity between 1 and 999.');
    }
    const lineTotal = roundRupiah(item.lineTotal);
    if (lineTotal <= 0 || lineTotal > MAX_LINE_TOTAL) {
      throw new Error('Every item needs a line total above 0.');
    }
  }

  const tax = roundRupiah(input.tax);
  const serviceCharge = roundRupiah(input.serviceCharge);
  const discount = roundRupiah(input.discount ?? 0);
  if (tax < 0 || serviceCharge < 0 || discount < 0) {
    throw new Error('Tax, service charge, and discount cannot be negative.');
  }

  const purchaseDate = parsePurchaseDate(input.purchaseDate);
  if (!purchaseDate) {
    throw new Error('A valid purchase date is required.');
  }

  const totalAmount = calculatedReceiptTotal({
    items: input.items,
    tax,
    serviceCharge,
    discount,
  });
  if (totalAmount < 0 || totalAmount > MAX_RECEIPT_TOTAL) {
    throw new Error('Receipt total is outside the accepted range.');
  }

  return { purchaseDate, tax, serviceCharge, discount, totalAmount };
}
