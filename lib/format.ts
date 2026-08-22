export function formatRupiah(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `Rp${safeAmount.toLocaleString('id-ID')}`;
}

export function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

const KNOWN_ACRONYMS = ['KFC', 'BCA', 'BNI', 'BRI', 'PLN', 'SPBU', 'AEON', 'CGV', 'ATM', 'QRIS', 'XXI', 'A&W', 'H&M'];

export function normalizeMerchantName(rawName: string | null | undefined): string {
  if (!rawName) return 'Unknown Store';
  
  // Clean up excessive whitespace
  const cleaned = rawName.trim().replace(/\s+/g, ' ');
  if (cleaned.length === 0) return 'Unknown Store';

  // Apply title case
  const titleCased = toTitleCase(cleaned);

  // Restore acronyms
  let finalName = titleCased;
  for (const acronym of KNOWN_ACRONYMS) {
    // Replace the title-cased version of the acronym with the all-caps version
    // using word boundaries to avoid replacing parts of other words
    const regex = new RegExp(`\\b${toTitleCase(acronym)}\\b`, 'gi');
    finalName = finalName.replace(regex, acronym);
  }

  return finalName;
}
