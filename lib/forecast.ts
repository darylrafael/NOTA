import { getDateParts } from './date';

export interface ItemSpendRecord {
  category: string;
  purchaseDate: string;
  amount: number;
}

export interface CategoryForecast {
  category: string;
  totalThisMonth: number;
  weeklyAverage: number;
  projectedEndOfMonth: number;
  previousMonthTotal: number | null;
  monthOverMonthPercent: number | null;
  monthOverMonthDiff: number | null;
  isNewCategory: boolean;
  isLowBaseline: boolean;
}

export interface ForecastInsight {
  category: string;
  percentChange: number;
}

export const MIN_MOM_BASELINE = 10_000;

function sumByCategoryForMonth(
  records: ItemSpendRecord[],
  year: number,
  month: number
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const record of records) {
    const parts = getDateParts(record.purchaseDate);
    if (!parts || parts.year !== year || parts.month !== month) continue;
    const category = record.category || 'Other';
    totals.set(category, (totals.get(category) ?? 0) + record.amount);
  }
  return totals;
}

export function calculateForecast(
  records: ItemSpendRecord[],
  referenceDate: Date = new Date()
): CategoryForecast[] {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysElapsed = referenceDate.getDate();
  const daysRemaining = daysInMonth - daysElapsed;
  const windowSize = Math.min(7, daysElapsed);

  const byCategory = new Map<string, Map<number, number>>();
  for (const record of records) {
    const parts = getDateParts(record.purchaseDate);
    if (!parts || parts.year !== year || parts.month !== month) continue;
    const category = record.category || 'Other';
    const day = parts.day;
    if (!byCategory.has(category)) byCategory.set(category, new Map());
    const dailyMap = byCategory.get(category)!;
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + record.amount);
  }

  const prevMonthDate = new Date(year, month - 1, 1);
  const previousTotals = sumByCategoryForMonth(records, prevMonthDate.getFullYear(), prevMonthDate.getMonth());

  const results: CategoryForecast[] = [];

  for (const [category, dailyMap] of byCategory.entries()) {
    let totalThisMonth = 0;
    for (const amount of dailyMap.values()) totalThisMonth += amount;

    let windowSum = 0;
    for (let day = daysElapsed - windowSize + 1; day <= daysElapsed; day++) {
      windowSum += dailyMap.get(day) ?? 0;
    }
    const movingDailyAverage = windowSum / windowSize;

    const weeklyAverage = movingDailyAverage * 7;
    const projectedEndOfMonth = totalThisMonth + movingDailyAverage * daysRemaining;

    const previousMonthTotal = previousTotals.get(category) ?? null;
    const isNewCategory = previousMonthTotal === null || previousMonthTotal === 0;
    const isLowBaseline = previousMonthTotal !== null && previousMonthTotal > 0 && previousMonthTotal < MIN_MOM_BASELINE;
    
    let monthOverMonthPercent: number | null = null;
    let monthOverMonthDiff: number | null = null;

    if (previousMonthTotal !== null) {
      monthOverMonthDiff = Math.round(totalThisMonth - previousMonthTotal);
      if (!isNewCategory && !isLowBaseline) {
        monthOverMonthPercent = Math.round(((totalThisMonth - previousMonthTotal) / previousMonthTotal) * 100);
      }
    }

    results.push({
      category,
      totalThisMonth: Math.round(totalThisMonth),
      weeklyAverage: Math.round(weeklyAverage),
      projectedEndOfMonth: Math.round(projectedEndOfMonth),
      previousMonthTotal: previousMonthTotal !== null ? Math.round(previousMonthTotal) : null,
      monthOverMonthPercent,
      monthOverMonthDiff,
      isNewCategory,
      isLowBaseline,
    });
  }

  return results.sort((a, b) => b.totalThisMonth - a.totalThisMonth);
}

/**
 * Shared source of truth for the biggest spending category this month.
 * Prefer non-'Other' categories; falls back to 'Other' only if it is the only category with spend.
 */
export function getTopSpendingCategory(
  forecastsOrRecords: CategoryForecast[] | ItemSpendRecord[],
  referenceDate: Date = new Date()
): { category: string; amount: number } | null {
  const forecasts =
    Array.isArray(forecastsOrRecords) && forecastsOrRecords.length > 0 && 'totalThisMonth' in forecastsOrRecords[0]
      ? (forecastsOrRecords as CategoryForecast[])
      : calculateForecast(forecastsOrRecords as ItemSpendRecord[], referenceDate);

  const active = forecasts.filter((f) => f.totalThisMonth > 0);
  if (active.length === 0) return null;

  const nonOther = active.filter((f) => f.category !== 'Other');
  if (nonOther.length > 0) {
    return { category: nonOther[0].category, amount: nonOther[0].totalThisMonth };
  }

  return { category: active[0].category, amount: active[0].totalThisMonth };
}

// Compares the trailing daily average (last up to 7 days) against the daily
// average of the days before that window, within the same month. Surfaces
// only the single biggest shift, and only if it clears a 20% threshold and
// there is at least 3 days of "before" data — avoids flagging noise from
// normal day-to-day variance or from too little history early in the month.
export function findBiggestTrendShift(
  records: ItemSpendRecord[],
  referenceDate: Date = new Date()
): ForecastInsight | null {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const daysElapsed = referenceDate.getDate();
  const windowSize = Math.min(7, daysElapsed);
  const priorDays = daysElapsed - windowSize;

  if (priorDays < 3) return null;

  const byCategory = new Map<string, Map<number, number>>();
  for (const record of records) {
    const parts = getDateParts(record.purchaseDate);
    if (!parts || parts.year !== year || parts.month !== month) continue;
    const category = record.category || 'Other';
    const day = parts.day;
    if (!byCategory.has(category)) byCategory.set(category, new Map());
    const dailyMap = byCategory.get(category)!;
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + record.amount);
  }

  let biggest: ForecastInsight | null = null;

  for (const [category, dailyMap] of byCategory.entries()) {
    let recentSum = 0;
    for (let day = daysElapsed - windowSize + 1; day <= daysElapsed; day++) {
      recentSum += dailyMap.get(day) ?? 0;
    }
    let priorSum = 0;
    for (let day = 1; day <= priorDays; day++) {
      priorSum += dailyMap.get(day) ?? 0;
    }

    const recentAvg = recentSum / windowSize;
    const priorAvg = priorSum / priorDays;

    if (priorAvg <= 0) continue;

    const percentChange = Math.round(((recentAvg - priorAvg) / priorAvg) * 100);

    if (!biggest || Math.abs(percentChange) > Math.abs(biggest.percentChange)) {
      biggest = { category, percentChange };
    }
  }

  if (biggest && Math.abs(biggest.percentChange) >= 20) return biggest;
  return null;
}
