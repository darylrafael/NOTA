import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRupiahInput, parseQuantityInput, roundRupiah, MAX_LINE_TOTAL } from '../money';
import {
  applyDatePart,
  currentMonthRange,
  isInRange,
  monthRange,
  parsePurchaseDate,
  previousMonthRange,
  shiftDateOnly,
  todayDateOnly,
} from '../date';
import {
  calculatedReceiptTotal,
  allocateReceiptTotalByCategory,
  displayUnitPrice,
  reconcileTotals,
  TOTAL_MATCH_TOLERANCE,
} from '../receiptMath';
import { parseAndValidateExtraction } from '../parseExtraction';
import { validateReceiptWrite } from '../receiptWrite';
import { categorizeItem } from '../categorize';
import { calculateForecast, findBiggestTrendShift } from '../forecast';
import { filterNonExpenseItems } from '../filterReceiptItems';
import { formatRupiah } from '../format';

describe('money', () => {
  test('treats dots and commas as thousand separators', () => {
    assert.equal(parseRupiahInput('186.500'), 186500);
    assert.equal(parseRupiahInput('186,500'), 186500);
    assert.equal(parseRupiahInput('Rp 2.000'), 2000);
  });

  test('rejects negative input and rounds to whole rupiah', () => {
    assert.equal(parseRupiahInput('-5000'), 0);
    assert.equal(parseRupiahInput(''), 0);
    assert.equal(roundRupiah(99.4), 99);
    assert.equal(roundRupiah(99.5), 100);
  });

  test('parses quantity as a whole number', () => {
    assert.equal(parseQuantityInput('3'), 3);
    assert.equal(parseQuantityInput('3.5'), 35);
    assert.equal(parseQuantityInput(''), 0);
  });
});

describe('date handling', () => {
  test('trusts YYYY-MM-DD as a local calendar date', () => {
    assert.equal(parsePurchaseDate('2026-07-31'), '2026-07-31');
    assert.equal(parsePurchaseDate('2026-8-2'), '2026-08-02');
  });

  test('parses Indonesian day/month/year dates', () => {
    assert.equal(parsePurchaseDate('31/07/2026'), '2026-07-31');
    assert.equal(parsePurchaseDate('1-8-2026'), '2026-08-01');
    assert.equal(parsePurchaseDate('12.08.2025'), '2025-08-12');
  });

  test('does not invent invalid or empty dates', () => {
    assert.equal(parsePurchaseDate(''), null);
    assert.equal(parsePurchaseDate('not a date'), null);
    assert.equal(parsePurchaseDate('2026-02-31'), null);
    assert.equal(parsePurchaseDate('31/02/2026'), null);
  });

  test('handles month and year boundaries', () => {
    assert.deepEqual(monthRange(2026, 11), { start: '2026-12-01', end: '2027-01-01' });
    assert.deepEqual(previousMonthRange(new Date(2026, 0, 5)), { start: '2025-12-01', end: '2026-01-01' });
    assert.deepEqual(currentMonthRange(new Date(2026, 7, 17)), { start: '2026-08-01', end: '2026-09-01' });
    assert.equal(isInRange('2026-08-31', '2026-08-01', '2026-09-01'), true);
    assert.equal(isInRange('2026-09-01', '2026-08-01', '2026-09-01'), false);
  });

  test('clamps January 31 when moving to February', () => {
    assert.equal(applyDatePart('2026-01-31', 'month', 2), '2026-02-28');
    assert.equal(applyDatePart('2024-01-31', 'month', 2), '2024-02-29');
  });

  test('does not shift a date into the future', () => {
    const today = todayDateOnly(new Date(2026, 7, 17));
    assert.equal(shiftDateOnly(today, 1, new Date(2026, 7, 17)), null);
    assert.equal(shiftDateOnly(today, -1, new Date(2026, 7, 17)), '2026-08-16');
  });
});

describe('financial calculations', () => {
  test('preserves an original line total that does not divide evenly', () => {
    assert.equal(displayUnitPrice(100, 3), 33);
    assert.equal(
      calculatedReceiptTotal({ items: [{ lineTotal: 100 }], tax: 0, serviceCharge: 0 }),
      100
    );
  });

  test('adds tax and service, then subtracts discount', () => {
    assert.equal(
      calculatedReceiptTotal({
        items: [{ lineTotal: 50000 }, { lineTotal: 25000 }],
        tax: 7500,
        serviceCharge: 4000,
        discount: 1500,
      }),
      85000
    );
  });

  test('treats zero charges as valid', () => {
    assert.equal(
      calculatedReceiptTotal({ items: [{ lineTotal: 12000 }], tax: 0, serviceCharge: 0, discount: 0 }),
      12000
    );
  });

  test('reconciles OCR total within tolerance and reports mismatch otherwise', () => {
    assert.equal(reconcileTotals(186500, 186500).status, 'match');
    assert.equal(reconcileTotals(186500, 186500 + TOTAL_MATCH_TOLERANCE).status, 'match');
    const mismatch = reconcileTotals(184500, 186500);
    assert.equal(mismatch.status, 'mismatch');
    assert.equal(mismatch.difference, -2000);
    assert.equal(reconcileTotals(10000, null).status, 'ocr_missing');
  });

  test('allocates receipt-level charges across categories without changing the grand total', () => {
    const allocations = allocateReceiptTotalByCategory(
      [
        { category: 'Groceries', lineTotal: 80000 },
        { category: 'Food & Drink', lineTotal: 20000 },
      ],
      110000
    );
    assert.deepEqual(allocations, [
      { category: 'Groceries', amount: 88000 },
      { category: 'Food & Drink', amount: 22000 },
    ]);
    assert.equal(allocations.reduce((sum, allocation) => sum + allocation.amount, 0), 110000);
  });

  test('keeps a rounding remainder on the final category so allocations stay exact', () => {
    const allocations = allocateReceiptTotalByCategory(
      [
        { category: 'Groceries', lineTotal: 1 },
        { category: 'Food & Drink', lineTotal: 1 },
        { category: 'Transport', lineTotal: 1 },
      ],
      4
    );
    assert.equal(allocations.reduce((sum, allocation) => sum + allocation.amount, 0), 4);
  });
});

describe('OCR parsing', () => {
  test('keeps lineTotal as the source of truth even when quantity does not divide evenly', () => {
    const result = parseAndValidateExtraction(
      JSON.stringify({
        merchantName: 'Warung Sederhana',
        purchaseDate: '12/08/2026',
        receiptTotal: 100,
        tax: 0,
        serviceCharge: 0,
        discount: 0,
        items: [{ name: 'Nasi goreng', quantity: 3, lineTotal: 100 }],
      })
    );
    assert.equal(result.purchaseDate, '2026-08-12');
    assert.equal(result.dateExtracted, true);
    assert.equal(result.items[0].lineTotal, 100);
    assert.equal(result.items[0].unitPrice, 33);
    assert.equal(result.items[0].quantity, 3);
  });

  test('parses transfer, QRIS, and e-wallet payloads', () => {
    for (const sourceType of ['bank_transfer', 'qris', 'ewallet'] as const) {
      const result = parseAndValidateExtraction(
        JSON.stringify({
          merchantName: 'Budi',
          purchaseDate: '2026-08-12',
          receiptTotal: 52500,
          tax: 2500,
          serviceCharge: 0,
          discount: 0,
          sourceType,
          items: [{ name: 'Uang patungan', quantity: 1, lineTotal: 50000, unitPrice: 50000 }],
        })
      );
      assert.equal(result.sourceType, sourceType);
      assert.equal(result.items.length, 1);
      assert.equal(result.receiptTotal, 52500);
      assert.equal(result.warnings.includes('total_mismatch'), false);
    }
  });

  test('flags a mismatched OCR total without overwriting either number', () => {
    const result = parseAndValidateExtraction(
      JSON.stringify({
        merchantName: 'Kopi Kenangan',
        purchaseDate: '2026-08-01',
        receiptTotal: 186500,
        tax: 0,
        serviceCharge: 0,
        discount: 0,
        items: [{ name: 'Americano', quantity: 1, lineTotal: 184500 }],
      })
    );
    assert.equal(result.receiptTotal, 186500);
    assert.equal(result.items[0].lineTotal, 184500);
    assert.equal(result.warnings.includes('total_mismatch'), true);
    assert.equal(result.hadParsingIssues, false);
  });

  test('rejects malformed JSON and empty item lists', () => {
    assert.throws(() => parseAndValidateExtraction('not json'), /MALFORMED_JSON/);
    assert.throws(
      () => parseAndValidateExtraction(JSON.stringify({ merchantName: 'X', items: 'nope' })),
      /UNEXPECTED_FORMAT/
    );
    assert.throws(
      () =>
        parseAndValidateExtraction(
          JSON.stringify({
            merchantName: 'X',
            items: [{ name: '', quantity: 1, lineTotal: 0 }],
          })
        ),
      /NO_VALID_ITEMS/
    );
  });

  test('clamps absurd values and drops invalid items', () => {
    const result = parseAndValidateExtraction(
      JSON.stringify({
        merchantName: '',
        purchaseDate: '',
        receiptTotal: 0,
        tax: -1000,
        serviceCharge: -50,
        discount: 0,
        items: [
          { name: 'Valid', quantity: 1, lineTotal: 15000 },
          { name: 'Bad', quantity: -2, lineTotal: -10 },
          { name: 'Huge', quantity: 5000, lineTotal: MAX_LINE_TOTAL + 1 },
        ],
      })
    );
    assert.equal(result.merchantName, '');
    assert.equal(result.dateExtracted, false);
    assert.equal(result.tax, 0);
    assert.equal(result.serviceCharge, 0);
    assert.equal(result.items.length, 2);
    assert.equal(result.items[1].lineTotal, MAX_LINE_TOTAL);
    assert.equal(result.items[1].quantity, 999);
    assert.ok(result.warnings.includes('missing_merchant'));
    assert.ok(result.warnings.includes('missing_date'));
    assert.ok(result.warnings.includes('missing_total'));
    assert.ok(result.warnings.includes('partial_items'));
    assert.ok(result.warnings.includes('clamped_values'));
  });

  test('filters non-expense rows such as tax and grand total', () => {
    const kept = filterNonExpenseItems([
      { name: 'Nasi goreng' },
      { name: 'PB1' },
      { name: 'Grand Total' },
      { name: 'Total Care Mouthwash' },
    ]);
    assert.deepEqual(
      kept.map((item) => item.name),
      ['Nasi goreng', 'Total Care Mouthwash']
    );
  });
});

describe('receipt write validation', () => {
  test('requires a valid date, names, and positive amounts', () => {
    assert.throws(
      () =>
        validateReceiptWrite({
          purchaseDate: 'not-a-date',
          items: [{ localId: '1', name: 'X', price: 1000, quantity: 1, category: 'Other', lineTotal: 1000 }],
          tax: 0,
          serviceCharge: 0,
        }),
      /purchase date/
    );
    assert.throws(
      () =>
        validateReceiptWrite({
          purchaseDate: '2026-08-12',
          items: [{ localId: '1', name: '', price: 1000, quantity: 1, category: 'Other', lineTotal: 1000 }],
          tax: 0,
          serviceCharge: 0,
        }),
      /name/
    );
    assert.throws(
      () =>
        validateReceiptWrite({
          purchaseDate: '2026-08-12',
          items: [{ localId: '1', name: 'X', price: 1000, quantity: 1, category: 'Other', lineTotal: 0 }],
          tax: 0,
          serviceCharge: 0,
        }),
      /line total/
    );
  });

  test('saves the calculated total from line totals plus charges', () => {
    const result = validateReceiptWrite({
      purchaseDate: '31/07/2026',
      items: [
        { localId: '1', name: 'Mie ayam', price: 33, quantity: 3, category: 'Food & Drink', lineTotal: 100 },
      ],
      tax: 10,
      serviceCharge: 5,
      discount: 5,
    });
    assert.equal(result.purchaseDate, '2026-07-31');
    assert.equal(result.totalAmount, 110);
  });
});

describe('category keywords', () => {
  test('classifies representative Indonesian items', () => {
    assert.equal(categorizeItem('Nasi goreng ayam'), 'Food & Drink');
    assert.equal(categorizeItem('Indomaret beras 5kg'), 'Groceries');
    assert.equal(categorizeItem('Pertalite 27.77L'), 'Transport');
    assert.equal(categorizeItem('Paracetamol Apotek'), 'Health');
    assert.equal(categorizeItem('Tiket XXI'), 'Entertainment');
    assert.equal(categorizeItem('Uniqlo baju'), 'Shopping');
    assert.equal(categorizeItem('Token listrik PLN'), 'Bills');
  });

  test('does not treat short keywords as substrings', () => {
    assert.equal(categorizeItem('Best quality cable'), 'Shopping');
    assert.notEqual(categorizeItem('Best quality cable'), 'Food & Drink');
  });

  test('falls back to Other for unknown names', () => {
    assert.equal(categorizeItem('XYZ-123 unknown sku'), 'Other');
  });
});

describe('forecast', () => {
  test('projects remaining days from the current month only', () => {
    const reference = new Date(2026, 7, 10);
    const result = calculateForecast(
      [
        { category: 'Food & Drink', purchaseDate: '2026-08-01', amount: 70000 },
        { category: 'Food & Drink', purchaseDate: '2026-08-09', amount: 70000 },
        { category: 'Food & Drink', purchaseDate: '2026-07-31', amount: 999999 },
        { category: 'Bills', purchaseDate: '2026-09-01', amount: 50000 },
      ],
      reference
    );
    const food = result.find((row) => row.category === 'Food & Drink');
    assert.ok(food);
    assert.equal(food!.totalThisMonth, 140000);
    assert.equal(food!.previousMonthTotal, null);
  });

  test('computes month-over-month across a year boundary', () => {
    const result = calculateForecast(
      [
        { category: 'Bills', purchaseDate: '2025-12-20', amount: 100000 },
        { category: 'Bills', purchaseDate: '2026-01-05', amount: 150000 },
      ],
      new Date(2026, 0, 20)
    );
    assert.equal(result[0].monthOverMonthPercent, 50);
  });

  test('requires enough history before surfacing a trend', () => {
    const early = findBiggestTrendShift(
      [{ category: 'Food & Drink', purchaseDate: '2026-08-01', amount: 10000 }],
      new Date(2026, 7, 4)
    );
    assert.equal(early, null);
  });
});

describe('display', () => {
  test('formats whole rupiah without decimals', () => {
    assert.equal(formatRupiah(186500), 'Rp186.500');
    assert.equal(formatRupiah(Number.NaN), 'Rp0');
  });
});
