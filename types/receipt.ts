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
