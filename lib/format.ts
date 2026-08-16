export function formatRupiah(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `Rp${safeAmount.toLocaleString('id-ID')}`;
}

export function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}
