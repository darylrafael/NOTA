import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReviewReasons, ReviewQueueRow } from '../reviewQueue';

describe('Review Queue Logic', () => {
  const baseRow: ReviewQueueRow = {
    merchant_name: 'Test Store',
    total_amount: 1000,
    items_sum: 1000,
    tax: 0,
    service_charge: 0,
    discount: 0,
    unassigned_items_count: 0,
    duplicate_count: 1, // 1 means itself (no duplicates)
  };

  test('Valid receipt -> no reasons', () => {
    const reasons = evaluateReviewReasons(baseRow);
    assert.deepEqual(reasons, []);
  });

  test('Missing merchant (null) -> flags missing_merchant', () => {
    const reasons = evaluateReviewReasons({ ...baseRow, merchant_name: null });
    assert.deepEqual(reasons, ['missing_merchant']);
  });

  test('Missing merchant (empty string) -> flags missing_merchant', () => {
    const reasons = evaluateReviewReasons({ ...baseRow, merchant_name: '   ' });
    assert.deepEqual(reasons, ['missing_merchant']);
  });

  test('Missing category -> flags missing_category', () => {
    const reasons = evaluateReviewReasons({ ...baseRow, unassigned_items_count: 1 });
    assert.deepEqual(reasons, ['missing_category']);
  });

  test('Math mismatch (> Rp100) -> flags math_mismatch', () => {
    // 1000 sum != 1101 total (difference 101)
    const reasons = evaluateReviewReasons({ ...baseRow, items_sum: 1000, total_amount: 1101 });
    assert.deepEqual(reasons, ['math_mismatch']);
  });

  test('Math match within tolerance (Rp100) -> accepted', () => {
    // 1000 sum vs 1100 total (difference 100)
    const reasons = evaluateReviewReasons({ ...baseRow, items_sum: 1000, total_amount: 1100 });
    assert.deepEqual(reasons, []);
  });

  test('Math match exact with tax/discount -> accepted', () => {
    // items: 1000, tax: 100, sc: 50, discount: 50 -> calculated = 1100
    const reasons = evaluateReviewReasons({ 
      ...baseRow, 
      items_sum: 1000, 
      tax: 100, 
      service_charge: 50, 
      discount: 50, 
      total_amount: 1100 
    });
    assert.deepEqual(reasons, []);
  });

  test('Potential duplicate -> flags potential_duplicate', () => {
    // duplicate_count > 1 means duplicates exist
    const reasons = evaluateReviewReasons({ ...baseRow, duplicate_count: 2 });
    assert.deepEqual(reasons, ['potential_duplicate']);
  });

  test('Multiple reasons -> flags all correctly', () => {
    const reasons = evaluateReviewReasons({ 
      ...baseRow, 
      merchant_name: '', 
      unassigned_items_count: 2,
      duplicate_count: 3,
      total_amount: 5000 // mismatch
    });
    assert.deepEqual(reasons, ['missing_merchant', 'missing_category', 'potential_duplicate', 'math_mismatch']);
  });
});
