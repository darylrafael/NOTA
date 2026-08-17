const DATE_ONLY = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DMY = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;
const YMD_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

export function todayDateOnly(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toDateOnly(date: Date): string {
  return todayDateOnly(date);
}

function padYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

function fromYmd(year: number, month: number, day: number): string | null {
  if (!isValidYmd(year, month, day)) return null;
  return padYmd(year, month, day);
}

/**
 * Normalize a stored or AI-provided date to YYYY-MM-DD.
 * Date-only strings are trusted as local calendar dates.
 * Full ISO timestamps use the calendar date in the string, not the device timezone.
 */
export function parsePurchaseDate(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const exact = trimmed.match(DATE_ONLY);
  if (exact) {
    return fromYmd(Number(exact[1]), Number(exact[2]), Number(exact[3]));
  }

  const dmy = trimmed.match(DMY);
  if (dmy) {
    // Indonesian documents use day/month/year.
    return fromYmd(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }

  // Legacy rows stored a full ISO timestamp. Convert with the device timezone.
  if (trimmed.includes('T')) {
    const dt = new Date(trimmed);
    if (Number.isNaN(dt.getTime())) return null;
    return todayDateOnly(dt);
  }

  const prefix = trimmed.match(YMD_PREFIX);
  if (prefix) {
    return fromYmd(Number(prefix[1]), Number(prefix[2]), Number(prefix[3]));
  }

  return null;
}

export function getDateParts(value: string): { year: number; month: number; day: number } | null {
  const dateOnly = parsePurchaseDate(value);
  if (!dateOnly) return null;
  const [year, month, day] = dateOnly.split('-').map(Number);
  return { year, month: month - 1, day };
}

export function formatPurchaseDate(value: string, locale = 'en-GB'): string {
  const parts = getDateParts(value);
  if (!parts) return 'Set date';
  const dt = new Date(parts.year, parts.month, parts.day);
  return dt.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatPurchaseDateLong(value: string, locale = 'en-GB'): string {
  const parts = getDateParts(value);
  if (!parts) return 'Unknown date';
  const dt = new Date(parts.year, parts.month, parts.day);
  return dt.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatPurchaseDateShort(value: string, locale = 'en-GB'): string {
  const parts = getDateParts(value);
  if (!parts) return 'Unknown date';
  const dt = new Date(parts.year, parts.month, parts.day);
  return dt.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function dateOnlyToDate(value: string): Date {
  const parsed = parsePurchaseDate(value) ?? todayDateOnly();
  const [year, month, day] = parsed.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function fromDateParts(year: number, monthIndex: number, day: number): string | null {
  const month = monthIndex + 1;
  if (month < 1 || month > 12 || year < 1900 || year > 2100) return null;
  const lastDay = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(Math.max(1, day), lastDay);
  return fromYmd(year, month, clampedDay);
}

export function shiftDateOnly(value: string, days: number, maxDate?: Date): string | null {
  const current = dateOnlyToDate(value);
  current.setDate(current.getDate() + days);
  const next = toDateOnly(current);
  if (maxDate && next > toDateOnly(maxDate)) return null;
  return next;
}

export function applyDatePart(
  value: string,
  part: 'day' | 'month' | 'year',
  n: number,
  maxDate?: Date
): string | null {
  const parts = getDateParts(value) ?? getDateParts(todayDateOnly());
  if (!parts) return null;
  let { year, month, day } = parts;
  if (part === 'day') day = n;
  if (part === 'month') month = n - 1;
  if (part === 'year') year = n;
  const next = fromDateParts(year, month, day);
  if (!next) return null;
  if (maxDate && next > toDateOnly(maxDate)) return null;
  return next;
}

export function monthRange(year: number, monthIndex: number): { start: string; end: string } {
  const start = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
  const endMonth = monthIndex === 11 ? 1 : monthIndex + 2;
  const endYear = monthIndex === 11 ? year + 1 : year;
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
  return { start, end };
}

export function currentMonthRange(now = new Date()): { start: string; end: string } {
  return monthRange(now.getFullYear(), now.getMonth());
}

export function previousMonthRange(now = new Date()): { start: string; end: string } {
  const monthIndex = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return monthRange(year, monthIndex);
}

export function isInRange(purchaseDate: string, start: string, end: string): boolean {
  const normalized = parsePurchaseDate(purchaseDate);
  if (!normalized) return false;
  return normalized >= start && normalized < end;
}
