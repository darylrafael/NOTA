import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSplitBill, SplitParticipant } from '../splitMath';
import { ReceiptDetail } from '../../db/queries';

test.describe('calculateSplitBill', () => {
  const me: SplitParticipant = { id: 'p1', name: 'Me' };
  const andi: SplitParticipant = { id: 'p2', name: 'Andi' };
  const budi: SplitParticipant = { id: 'p3', name: 'Budi' };

  const baseReceipt: ReceiptDetail = {
    id: 'r1',
    merchantName: 'Warung',
    purchaseDate: '2023-01-01',
    totalAmount: 0,
    tax: 0,
    serviceCharge: 0,
    discount: 0,
    sourceType: 'receipt',
    imageUri: null,
    items: [],
  };

  test('Test 1 - Simple item split (1 item, 2 people)', () => {
    const r = { ...baseReceipt, totalAmount: 50000, items: [
      { id: 'i1', name: 'Item', price: 50000, quantity: 1, category: 'Food', lineTotal: 50000 }
    ] };
    const summary = calculateSplitBill(r, [me, andi], { i1: ['p1', 'p2'] });
    assert.deepStrictEqual(summary.totalReconciled, true);
    assert.deepStrictEqual(summary.participants.find(p => p.participantId === 'p1')?.subtotal, 25000);
    assert.deepStrictEqual(summary.participants.find(p => p.participantId === 'p2')?.subtotal, 25000);
  });

  test('Test 2 - Single-person item', () => {
    const r = { ...baseReceipt, totalAmount: 50000, items: [
      { id: 'i1', name: 'Item', price: 50000, quantity: 1, category: 'Food', lineTotal: 50000 }
    ] };
    const summary = calculateSplitBill(r, [me, andi], { i1: ['p1'] });
    assert.deepStrictEqual(summary.totalReconciled, true);
    assert.deepStrictEqual(summary.participants.find(p => p.participantId === 'p1')?.subtotal, 50000);
    assert.deepStrictEqual(summary.participants.find(p => p.participantId === 'p2')?.subtotal, 0);
  });

  test('Test 3 - Shared multiple people (3 people)', () => {
    const r = { ...baseReceipt, totalAmount: 120000, items: [
      { id: 'i1', name: 'Pizza', price: 120000, quantity: 1, category: 'Food', lineTotal: 120000 }
    ] };
    const summary = calculateSplitBill(r, [me, andi, budi], { i1: ['p1', 'p2', 'p3'] });
    assert.deepStrictEqual(summary.totalReconciled, true);
    assert.deepStrictEqual(summary.participants.find(p => p.participantId === 'p1')?.subtotal, 40000);
    assert.deepStrictEqual(summary.participants.find(p => p.participantId === 'p2')?.subtotal, 40000);
    assert.deepStrictEqual(summary.participants.find(p => p.participantId === 'p3')?.subtotal, 40000);
  });

  test('Test 4 - Tax proportional allocation', () => {
    const r = { ...baseReceipt, totalAmount: 165000, tax: 15000, items: [
      { id: 'i1', name: 'Item 1', price: 100000, quantity: 1, category: 'Food', lineTotal: 100000 },
      { id: 'i2', name: 'Item 2', price: 50000, quantity: 1, category: 'Food', lineTotal: 50000 }
    ] };
    const summary = calculateSplitBill(r, [me, andi], { i1: ['p1'], i2: ['p2'] });
    assert.deepStrictEqual(summary.totalReconciled, true);
    assert.deepStrictEqual(summary.participants.find(p => p.participantId === 'p1')?.tax, 10000);
    assert.deepStrictEqual(summary.participants.find(p => p.participantId === 'p2')?.tax, 5000);
  });

  test('Test 6 - Discount proportional allocation', () => {
    const r = { ...baseReceipt, totalAmount: 120000, discount: 30000, items: [
      { id: 'i1', name: 'Item 1', price: 100000, quantity: 1, category: 'Food', lineTotal: 100000 },
      { id: 'i2', name: 'Item 2', price: 50000, quantity: 1, category: 'Food', lineTotal: 50000 }
    ] };
    const summary = calculateSplitBill(r, [me, andi], { i1: ['p1'], i2: ['p2'] });
    assert.deepStrictEqual(summary.totalReconciled, true);
    assert.deepStrictEqual(summary.participants.find(p => p.participantId === 'p1')?.discount, 20000);
    assert.deepStrictEqual(summary.participants.find(p => p.participantId === 'p2')?.discount, 10000);
  });

  test('Test 7 - Rounding remainder matches exact total', () => {
    const r = { ...baseReceipt, totalAmount: 110000, tax: 10000, items: [
      { id: 'i1', name: 'Item', price: 100000, quantity: 1, category: 'Food', lineTotal: 100000 }
    ] };
    // Tax is 10000, divided by 3 people = 3333, 3333, 3334
    const summary = calculateSplitBill(r, [me, andi, budi], { i1: ['p1', 'p2', 'p3'] });
    assert.deepStrictEqual(summary.totalReconciled, true);
    assert.deepStrictEqual(summary.totalCalculated, 110000);
    const p1 = summary.participants.find(p => p.participantId === 'p1')!;
    const p2 = summary.participants.find(p => p.participantId === 'p2')!;
    const p3 = summary.participants.find(p => p.participantId === 'p3')!;
    assert.deepStrictEqual(p1.tax + p2.tax + p3.tax, 10000);
  });

  test('Test 10 - Unassigned item blocks reconciliation', () => {
    const r = { ...baseReceipt, totalAmount: 150000, items: [
      { id: 'i1', name: 'Item 1', price: 100000, quantity: 1, category: 'Food', lineTotal: 100000 },
      { id: 'i2', name: 'Item 2', price: 50000, quantity: 1, category: 'Food', lineTotal: 50000 }
    ] };
    const summary = calculateSplitBill(r, [me, andi], { i1: ['p1'] }); // i2 is unassigned
    assert.deepStrictEqual(summary.totalReconciled, false);
    assert.deepStrictEqual(summary.unassignedItemsCount, 1);
  });
});
