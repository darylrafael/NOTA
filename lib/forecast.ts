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
}

export interface ForecastInsight {
  category: string;
  percentChange: number;
}

function sumByCategoryForMonth(
  records: ItemSpendRecord[],
  year: number,
  month: number
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const record of records) {
    const date = new Date(record.purchaseDate);
    if (date.getFullYear() !== year || date.getMonth() !== month) continue;
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
    const date = new Date(record.purchaseDate);
    if (date.getFullYear() !== year || date.getMonth() !== month) continue;
    const category = record.category || 'Other';
    const day = date.getDate();
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
    const monthOverMonthPercent =
      previousMonthTotal && previousMonthTotal > 0
        ? Math.round(((totalThisMonth - previousMonthTotal) / previousMonthTotal) * 100)
        : null;

    results.push({
      category,
      totalThisMonth: Math.round(totalThisMonth),
      weeklyAverage: Math.round(weeklyAverage),
      projectedEndOfMonth: Math.round(projectedEndOfMonth),
      previousMonthTotal: previousMonthTotal !== null ? Math.round(previousMonthTotal) : null,
      monthOverMonthPercent,
    });
  }

  return results.sort((a, b) => b.totalThisMonth - a.totalThisMonth);
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
    const date = new Date(record.purchaseDate);
    if (date.getFullYear() !== year || date.getMonth() !== month) continue;
    const category = record.category || 'Other';
    const day = date.getDate();
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
