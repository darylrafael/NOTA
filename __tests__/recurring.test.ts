import test from 'node:test';
import assert from 'node:assert';
import { parsePurchaseDate, formatPurchaseDate } from '../date';

test('Recurring Logic', async (t) => {
  await t.test('ordinal suffix generation', () => {
    function getOrdinalSuffix(n: number) {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }
    
    assert.strictEqual(getOrdinalSuffix(1), '1st');
    assert.strictEqual(getOrdinalSuffix(2), '2nd');
    assert.strictEqual(getOrdinalSuffix(3), '3rd');
    assert.strictEqual(getOrdinalSuffix(4), '4th');
    assert.strictEqual(getOrdinalSuffix(11), '11th');
    assert.strictEqual(getOrdinalSuffix(12), '12th');
    assert.strictEqual(getOrdinalSuffix(13), '13th');
    assert.strictEqual(getOrdinalSuffix(21), '21st');
    assert.strictEqual(getOrdinalSuffix(22), '22nd');
    assert.strictEqual(getOrdinalSuffix(31), '31st');
  });

  await t.test('end of month clamping', () => {
    // Generate safe due date
    function getSafeDate(year: number, month: number, billingDate: number) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return Math.min(billingDate, daysInMonth);
    }
    
    // Feb 2024 (Leap year)
    assert.strictEqual(getSafeDate(2024, 1, 31), 29);
    // Feb 2025 (Non-leap year)
    assert.strictEqual(getSafeDate(2025, 1, 31), 28);
    // Apr 2024
    assert.strictEqual(getSafeDate(2024, 3, 31), 30);
    // Jan 2024
    assert.strictEqual(getSafeDate(2024, 0, 31), 31);
    // Jan 2024 with 15th
    assert.strictEqual(getSafeDate(2024, 0, 15), 15);
  });

  await t.test('overdue state calculation', () => {
    function isOverdue(dueDateStr: string, isPaid: boolean, todayStr: string) {
      if (isPaid) return false;
      const today = new Date(todayStr);
      today.setHours(0,0,0,0);
      const d = new Date(dueDateStr);
      d.setHours(0,0,0,0);
      return d.getTime() < today.getTime();
    }
    
    // Unpaid, due yesterday -> overdue
    assert.strictEqual(isOverdue('2024-02-15T00:00:00.000Z', false, '2024-02-16T00:00:00.000Z'), true);
    // Unpaid, due today -> NOT overdue (due soon)
    assert.strictEqual(isOverdue('2024-02-15T00:00:00.000Z', false, '2024-02-15T00:00:00.000Z'), false);
    // Unpaid, due tomorrow -> NOT overdue
    assert.strictEqual(isOverdue('2024-02-15T00:00:00.000Z', false, '2024-02-14T00:00:00.000Z'), false);
    // Paid, due yesterday -> NOT overdue
    assert.strictEqual(isOverdue('2024-02-15T00:00:00.000Z', true, '2024-02-16T00:00:00.000Z'), false);
  });
});
