import { SQLiteDatabase } from 'expo-sqlite';
import { getAllReceipts, getMonthlyItemSpend, getTopMerchants } from '../db/queries';
import { toDateOnly, getCurrentWeekRange, getPreviousWeekRange } from './date';

export interface WeeklyPulseData {
  currentWeekTotal: number;
  previousWeekTotal: number | null;
  weekOverWeekAbsoluteDelta: number;
  weekOverWeekPercentageDelta: number;
  transactionCount: number;
  topCategory: string | null;
  topMerchant: string | null;
  largestTransactionAmount: number | null;
  insightText: string | null;
}

export async function generateWeeklyPulse(
  db: SQLiteDatabase,
  referenceDate: Date = new Date()
): Promise<WeeklyPulseData> {
  const currentWeek = getCurrentWeekRange(referenceDate);
  const previousWeek = getPreviousWeekRange(referenceDate);

  const currentReceipts = await getAllReceipts(db, {
    startDate: currentWeek.start,
    endDate: currentWeek.end,
  });

  const previousReceipts = await getAllReceipts(db, {
    startDate: previousWeek.start,
    endDate: previousWeek.end,
  });

  let currentWeekTotal = 0;
  let largestTransactionAmount: null | number = null;
  let largestMerchant: string | null = null;

  for (const r of currentReceipts) {
    currentWeekTotal += r.totalAmount;
    if (largestTransactionAmount === null || r.totalAmount > largestTransactionAmount) {
      largestTransactionAmount = r.totalAmount;
      largestMerchant = r.merchantName;
    }
  }

  let previousWeekTotal: number | null = null;
  if (previousReceipts.length > 0) {
    previousWeekTotal = 0;
    for (const r of previousReceipts) {
      previousWeekTotal += r.totalAmount;
    }
  }

  const wowAbsolute = previousWeekTotal !== null ? currentWeekTotal - previousWeekTotal : 0;
  const wowPercent = previousWeekTotal !== null && previousWeekTotal > 0 
    ? Math.round((wowAbsolute / previousWeekTotal) * 100) 
    : 0;

  const topMerchants = await getTopMerchants(db, currentWeek.start, currentWeek.end, 'frequency');
  const topMerchantObj = topMerchants.length > 0 ? topMerchants[0] : null;
  const topMerchantName = topMerchantObj?.merchantName || null;

  const items = await getMonthlyItemSpend(db, currentWeek.start, currentWeek.end);
  const catTotals: Record<string, number> = {};
  for (const item of items) {
    const cat = item.category || 'Other';
    const amt = item.amount;
    catTotals[cat] = (catTotals[cat] || 0) + amt;
  }
  
  let topCategory: string | null = null;
  let topCategoryAmount = 0;
  for (const [cat, amt] of Object.entries(catTotals)) {
    if (cat !== 'Other' && amt > topCategoryAmount) {
      topCategory = cat;
      topCategoryAmount = amt;
    }
  }
  if (!topCategory && catTotals['Other']) {
    topCategory = 'Other';
    topCategoryAmount = catTotals['Other'];
  }

  let insightText: string | null = null;

  if (currentReceipts.length === 0) {
    insightText = "Nothing logged yet this week.";
  } else if (currentReceipts.length === 1) {
    insightText = null;
  } else {
    const insights: { text: string; weight: number }[] = [];

    if (topMerchantObj && topMerchantObj.visitCount >= 3) {
      insights.push({
        text: `Most visits were to ${topMerchantObj.merchantName} — ${topMerchantObj.visitCount} transactions.`,
        weight: 90
      });
    } else if (topMerchantObj && topMerchantObj.visitCount === 2) {
      insights.push({
        text: `You visited ${topMerchantObj.merchantName} twice this week.`,
        weight: 60
      });
    }

    if (topCategory && topCategoryAmount > (currentWeekTotal * 0.4)) {
      insights.push({
        text: `${topCategory} made up most of your spending this week.`,
        weight: 85
      });
    } else if (topCategory) {
      insights.push({
        text: `You spent most on ${topCategory} this week.`,
        weight: 70
      });
    }

    if (largestTransactionAmount !== null && largestTransactionAmount > (currentWeekTotal * 0.5) && largestMerchant) {
      insights.push({
        text: `Your largest expense was at ${largestMerchant}.`,
        weight: 80
      });
    }

    if (previousWeekTotal !== null && previousWeekTotal > 50000) {
      if (wowPercent <= -20) {
        insights.push({
          text: "Your spending was noticeably lower than last week.",
          weight: 75
        });
      }
    }

    insights.sort((a, b) => b.weight - a.weight);
    if (insights.length > 0) {
      insightText = insights[0].text;
    }
  }

  return {
    currentWeekTotal,
    previousWeekTotal,
    weekOverWeekAbsoluteDelta: wowAbsolute,
    weekOverWeekPercentageDelta: wowPercent,
    transactionCount: currentReceipts.length,
    topCategory,
    topMerchant: topMerchantName,
    largestTransactionAmount,
    insightText
  };
}

