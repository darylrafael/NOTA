import { SourceType } from '../types/receipt';

export interface DocumentTypeMeta {
  label: string;
  icon: any; // Using any for vector-icons glyph names to avoid tight coupling
}

export const DOCUMENT_TYPE_META: Record<SourceType, DocumentTypeMeta> = {
  receipt: {
    label: 'Receipt',
    icon: 'receipt-outline',
  },
  bank_transfer: {
    label: 'Bank Transfer',
    icon: 'swap-horizontal-outline',
  },
  ewallet: {
    label: 'E-Wallet',
    icon: 'wallet-outline',
  },
  qris: {
    label: 'QRIS',
    icon: 'qr-code-outline',
  }
};
