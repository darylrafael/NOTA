import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRupiahInput, parseQuantityInput, roundRupiah, MAX_LINE_TOTAL } from '../money';
import {
  applyDatePart,
  currentMonthRange,
  isInRange,
  monthRange,
  parsePurchaseDate,
  formatPurchaseDate,
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
import { calculateForecast, findBiggestTrendShift, getTopSpendingCategory } from '../forecast';
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
    assert.equal(parseQuantityInput('0'), 0);
    assert.equal(parseQuantityInput(''), 0);
  });
});

describe('date handling', () => {
  test('trusts YYYY-MM-DD as a local calendar date', () => {
    const parsed = parsePurchaseDate('2026-08-17');
    assert.ok(parsed);
    assert.equal(formatPurchaseDate(parsed!), '17 Aug 2026');
  });

  test('parses Indonesian day/month/year dates', () => {
    const slash = parsePurchaseDate('17/08/2026');
    assert.ok(slash);
    assert.equal(formatPurchaseDate(slash!), '17 Aug 2026');

    const dotted = parsePurchaseDate('17.08.2026');
    assert.ok(dotted);
    assert.equal(formatPurchaseDate(dotted!), '17 Aug 2026');
  });

  test('does not invent invalid or empty dates', () => {
    assert.equal(parsePurchaseDate(null), null);
    assert.equal(parsePurchaseDate(''), null);
    assert.equal(parsePurchaseDate('not-a-date'), null);
  });

  test('handles month and year boundaries', () => {
    const rangeDec = monthRange(2025, 11);
    assert.equal(rangeDec.start, '2025-12-01');
    assert.equal(rangeDec.end, '2026-01-01');
  });

  test('clamps January 31 when moving to February', () => {
    const jan31 = '2026-01-31';
    const feb = applyDatePart(jan31, 'month', 2, new Date(2026, 7, 17));
    assert.ok(feb);
    assert.equal(feb, '2026-02-28');
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

  test('reconciles OCR total with exact match vs small difference vs mismatch', () => {
    // Exact match
    const exact = reconcileTotals(80000, 80000);
    assert.equal(exact.status, 'match');
    assert.equal(exact.difference, 0);

    // Small difference within tolerance (e.g. Rp8 off)
    const smallDiff = reconcileTotals(80008, 80000);
    assert.equal(smallDiff.status, 'small_difference');
    assert.equal(smallDiff.difference, 8);

    // Large mismatch
    const mismatch = reconcileTotals(84500, 80000);
    assert.equal(mismatch.status, 'mismatch');
    assert.equal(mismatch.difference, 4500);

    // Missing printed OCR total
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
        merchantName: 'Warung Nasi',
        purchaseDate: '2026-08-17',
        receiptTotal: 100,
        tax: 0,
        serviceCharge: 0,
        discount: 0,
        items: [{ name: 'Kerupuk', quantity: 3, lineTotal: 100 }],
      })
    );
    assert.equal(result.items[0].lineTotal, 100);
    assert.equal(result.items[0].unitPrice, 33);
    assert.equal(result.dateExtracted, true);
  });

  test('parses transfer, QRIS, and e-wallet payloads', () => {
    const sourceTypes = ['bank_transfer', 'ewallet', 'qris'] as const;
    for (const sourceType of sourceTypes) {
      const result = parseAndValidateExtraction(
        JSON.stringify({
          sourceType,
          merchantName: 'BCA Transfer',
          purchaseDate: '2026-08-17',
          receiptTotal: 250000,
          tax: 2500,
          serviceCharge: 0,
          discount: 0,
          items: [{ name: 'Transfer to Budi', quantity: 1, lineTotal: 250000 }],
        })
      );
      assert.equal(result.sourceType, sourceType);
      assert.equal(result.items.length, 1);
    }
  });

  test('flags a mismatched OCR total without overwriting either number', () => {
    const result = parseAndValidateExtraction(
      JSON.stringify({
        merchantName: 'Toko Baju',
        purchaseDate: '2026-08-17',
        receiptTotal: 200000,
        tax: 0,
        serviceCharge: 0,
        discount: 0,
        items: [{ name: 'Kemeja', quantity: 1, lineTotal: 150000 }],
      })
    );
    assert.ok(result.warnings.includes('total_mismatch'));
    assert.equal(result.receiptTotal, 200000);
  });

  test('flags suspicious tax when rate percentage is mistaken for nominal rupiah', () => {
    const result = parseAndValidateExtraction(
      JSON.stringify({
        merchantName: 'Restoran Enak',
        purchaseDate: '2026-08-17',
        receiptTotal: 91008,
        tax: 8, // Mistaken 8% for Rp 8 on Rp 91.000 subtotal
        serviceCharge: 0,
        discount: 0,
        items: [{ name: 'Nasi Goreng Spesial', quantity: 2, lineTotal: 91000 }],
      })
    );
    assert.ok(result.warnings.includes('suspicious_tax'));
    assert.equal(result.tax, 8); // Raw value preserved
    assert.equal(result.hadParsingIssues, true);
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
          JSON.stringify({ merchantName: 'X', items: [{ name: '', lineTotal: 0 }] })
        ),
      /NO_VALID_ITEMS/
    );
  });

  test('clamps absurd values and drops invalid items', () => {
    const result = parseAndValidateExtraction(
      JSON.stringify({
        merchantName: 'Megamart',
        purchaseDate: '2026-08-17',
        receiptTotal: 9999999999,
        tax: -50,
        serviceCharge: 0,
        discount: 0,
        items: [
          { name: 'Normal Item', quantity: 1, lineTotal: 10000 },
          { name: 'Invalid Item', quantity: 0, lineTotal: 0 },
        ],
      })
    );
    assert.equal(result.items.length, 1);
    assert.ok(result.warnings.includes('clamped_values'));
    assert.ok(result.warnings.includes('partial_items'));
    assert.equal(result.tax, 0);
  });

  test('filters non-expense rows such as tax and grand total', () => {
    const filtered = filterNonExpenseItems([
      { name: 'Nasi goreng' },
      { name: 'Total bayar' },
      { name: 'Grand Total' },
      { name: 'Total Care Mouthwash' },
      { name: 'PB1' },
      { name: 'Kembalian' },
    ]);
    assert.deepEqual(
      filtered.map((item) => item.name),
      ['Nasi goreng', 'Total Care Mouthwash']
    );
  });
});

describe('receipt write validation', () => {
  test('requires a valid date, names, and positive amounts', () => {
    assert.throws(
      () =>
        validateReceiptWrite({
          purchaseDate: 'invalid',
          items: [{ localId: '1', name: 'Item', quantity: 1, price: 1000, category: 'Other', lineTotal: 1000 }],
          tax: 0,
          serviceCharge: 0,
        }),
      /A valid purchase date is required/
    );
  });

  test('saves the calculated total from line totals plus charges', () => {
    const validated = validateReceiptWrite({
      purchaseDate: '2026-08-17',
      tax: 5000,
      serviceCharge: 2000,
      discount: 1000,
      items: [
        { localId: '1', name: 'Item A', quantity: 1, price: 10000, category: 'Food & Drink', lineTotal: 10000 },
        { localId: '2', name: 'Item B', quantity: 2, price: 5000, category: 'Groceries', lineTotal: 10000 },
      ],
    });
    assert.equal(validated.totalAmount, 26000);
    assert.equal(validated.tax, 5000);
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

describe('forecast and top category', () => {
  test('projects remaining days from the current month only', () => {
    const reference = new Date(2026, 7, 10);
    const result = calculateForecast(
      [
        { category: 'Food & Drink', purchaseDate: '2026-08-01', amount: 70000 },
        { category: 'Food & Drink', purchaseDate: '2026-08-09', amount: 70000 },
        { category: 'Food & Drink', purchaseDate: '2026-06-30', amount: 999999 },
        { category: 'Bills', purchaseDate: '2026-09-01', amount: 50000 },
      ],
      reference
    );
    const food = result.find((row) => row.category === 'Food & Drink');
    assert.ok(food);
    assert.equal(food!.totalThisMonth, 140000);
    assert.equal(food!.previousMonthTotal, null);
    assert.equal(food!.isNewCategory, true);
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
    assert.equal(result[0].monthOverMonthDiff, 50000);
    assert.equal(result[0].isLowBaseline, false);
  });

  test('handles low baseline spending without exploding percentage', () => {
    const result = calculateForecast(
      [
        { category: 'Shopping', purchaseDate: '2026-07-15', amount: 1000 }, // Very low baseline (< Rp10.000)
        { category: 'Shopping', purchaseDate: '2026-08-10', amount: 27930 },
      ],
      new Date(2026, 7, 15)
    );
    assert.equal(result[0].isLowBaseline, true);
    assert.equal(result[0].monthOverMonthPercent, null); // suppressed
    assert.equal(result[0].monthOverMonthDiff, 26930);
  });

  test('getTopSpendingCategory unifies source of truth and prioritizes valid category over Other', () => {
    const records = [
      { category: 'Other', purchaseDate: '2026-08-01', amount: 500000 },
      { category: 'Food & Drink', purchaseDate: '2026-08-02', amount: 300000 },
      { category: 'Groceries', purchaseDate: '2026-08-03', amount: 100000 },
    ];
    const top = getTopSpendingCategory(records, new Date(2026, 7, 15));
    assert.ok(top);
    assert.equal(top!.category, 'Food & Drink');
    assert.equal(top!.amount, 300000);

    // If only Other exists:
    const onlyOther = getTopSpendingCategory(
      [{ category: 'Other', purchaseDate: '2026-08-01', amount: 500000 }],
      new Date(2026, 7, 15)
    );
    assert.equal(onlyOther?.category, 'Other');
    assert.equal(onlyOther?.amount, 500000);
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
