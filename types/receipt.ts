export type SourceType = 'receipt' | 'bank_transfer' | 'ewallet' | 'qris';

export type ExtractionWarning =
  | 'missing_merchant'
  | 'missing_date'
  | 'missing_total'
  | 'partial_items'
  | 'clamped_values'
  | 'total_mismatch'
  | 'suspicious_tax';

export interface ParsedReceiptItem {
  name: string;
  /** Display/edit unit price. Not the source of truth for the line amount. */
  unitPrice: number;
  quantity: number;
  /** Original line amount from the document. Source of truth for this row. */
  lineTotal: number;
}

export interface GeminiExtractionResult {
  items: ParsedReceiptItem[];
  hadParsingIssues: boolean;
  merchantName: string;
  receiptTotal: number | null;
  tax: number;
  serviceCharge: number;
  discount: number;
  sourceType: SourceType;
  purchaseDate: string | null;
  dateExtracted: boolean;
  warnings: ExtractionWarning[];
}

export interface EditableReceiptItem {
  localId: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  lineTotal: number;
}

export interface PriceBookItem {
  itemName: string;
  normalizedName: string;
  category: string;
  purchaseCount: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  lastPrice: number;
  lastPurchaseDate: string;
}

export interface PriceBookTransaction {
  receiptId: string;
  purchaseDate: string;
  merchantName: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export type ReviewReason =
  | 'missing_merchant'
  | 'missing_category'
  | 'math_mismatch'
  | 'potential_duplicate';

export interface ReviewQueueItem {
  id: string;
  merchantName: string | null;
  totalAmount: number;
  purchaseDate: string;
  isSharedExpense: boolean;
  imageUri: string | null;
  reasons: ReviewReason[];
}

export interface RecurringRule {
  id: string;
  name: string;
  amount: number;
  category: string;
  billing_date: number;
  frequency: string;
  last_paid_date?: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface UpcomingBill {
  rule: RecurringRule;
  isPaid: boolean;
  isOverdue: boolean;
  paidDate?: string;
  dueDate: string; // ISO date for this month
}
