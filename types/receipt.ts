export type SourceType = 'receipt' | 'bank_transfer' | 'ewallet' | 'qris';

export interface ParsedReceiptItem {
  name: string;
  price: number;
  quantity: number;
}

export interface GeminiExtractionResult {
  items: ParsedReceiptItem[];
  hadParsingIssues: boolean;
  merchantName: string;
  receiptTotal: number;
  tax: number;
  serviceCharge: number;
  sourceType: SourceType;
}

export interface EditableReceiptItem {
  localId: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  lineTotal: number;
}
