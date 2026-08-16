const NON_EXPENSE_PATTERNS = [
  'subtotal',
  'sub total',
  'tax',
  'pajak',
  'ppn',
  'pb1',
  'pb 1',
  'service charge',
  'service',
  'sc',
  'biaya layanan',
  'total',
  'grand total',
  'total bayar',
  'total tagihan',
  'kembalian',
  'change',
  'tunai',
  'cash',
  'pembayaran',
  'payment',
  'diskon',
  'discount',
  'kartu',
  'debit',
  'kredit',
  'qris',
  'gopay',
  'ovo',
  'dana',
  'shopeepay',
];

export function filterNonExpenseItems<T extends { name: string }>(items: T[]): T[] {
  return items.filter((item) => {
    const normalized = item.name.trim().toLowerCase().replace(/:$/, '');
    
    // Exact match is safer to avoid false positives (e.g., 'Total Care Mouthwash')
    if (NON_EXPENSE_PATTERNS.includes(normalized)) {
      return false;
    }
    
    // Broader substring/prefix match for obvious non-item lines
    if (
      normalized.includes('total bayar') ||
      normalized.includes('grand total') ||
      normalized.includes('total tagihan') ||
      normalized.includes('kembalian') ||
      normalized.startsWith('total ') ||
      normalized.startsWith('subtotal ') ||
      normalized.startsWith('pajak ') ||
      normalized.startsWith('tax ') ||
      normalized.startsWith('diskon ') ||
      normalized.startsWith('discount ') ||
      normalized.startsWith('tunai ') ||
      normalized.startsWith('cash ') ||
      normalized.startsWith('payment ') ||
      normalized.startsWith('pembayaran ') ||
      normalized.startsWith('kembali ')
    ) {
      return false;
    }

    return true;
  });
}

