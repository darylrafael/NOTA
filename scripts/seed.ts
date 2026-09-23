import * as SQLite from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';

export async function seedRealisticData(db: SQLite.SQLiteDatabase) {
  const receipts = [
    // August 2026
    { merchant: 'PLN', amount: 1800000, date: '2026-08-02T10:00:00Z', items: [{ name: 'Token Listrik', price: 1800000, cat: 'Bills' }] },
    { merchant: 'First Media', amount: 650000, date: '2026-08-05T09:30:00Z', items: [{ name: 'Internet Bulanan', price: 650000, cat: 'Bills' }] },
    { merchant: 'Pasar 8 Alam Sutera', amount: 450000, date: '2026-08-03T07:15:00Z', items: [{ name: 'Sayur & Daging', price: 450000, cat: 'Groceries' }] },
    { merchant: 'Ranch Market The Breeze', amount: 1200000, date: '2026-08-10T14:20:00Z', items: [{ name: 'Groceries Bulanan', price: 1200000, cat: 'Groceries' }] },
    { merchant: 'Pagi Sore Gading Serpong', amount: 850000, date: '2026-08-12T19:00:00Z', items: [{ name: 'Makan Malam', price: 850000, cat: 'Food & Drink' }] },
    { merchant: 'Kopi Kenangan SMS', amount: 85000, date: '2026-08-14T15:45:00Z', items: [{ name: 'Kopi Susu x3', price: 85000, cat: 'Food & Drink' }] },
    { merchant: 'Sushi Tei The Breeze', amount: 450000, date: '2026-08-18T18:30:00Z', items: [{ name: 'Sushi Set', price: 450000, cat: 'Food & Drink' }] },
    { merchant: 'Shell Gading Serpong', amount: 400000, date: '2026-08-20T08:10:00Z', items: [{ name: 'Bensin V-Power', price: 400000, cat: 'Transport' }] },
    { merchant: 'Gojek', amount: 35000, date: '2026-08-21T11:00:00Z', items: [{ name: 'GoRide', price: 35000, cat: 'Transport' }] },
    { merchant: 'UNIQLO SMS', amount: 890000, date: '2026-08-25T16:20:00Z', items: [{ name: 'Pakaian', price: 890000, cat: 'Shopping' }] },
    { merchant: 'IKEA Alam Sutera', amount: 1250000, date: '2026-08-26T13:00:00Z', items: [{ name: 'Perabotan', price: 1250000, cat: 'Shopping' }] },
    { merchant: 'XXI Summarecon Mall Serpong', amount: 150000, date: '2026-08-28T20:00:00Z', items: [{ name: 'Tiket Bioskop', price: 150000, cat: 'Entertainment' }] },
    
    // September 2026
    { merchant: 'PLN', amount: 1800000, date: '2026-09-02T10:05:00Z', items: [{ name: 'Token Listrik', price: 1800000, cat: 'Bills' }] },
    { merchant: 'First Media', amount: 650000, date: '2026-09-05T09:10:00Z', items: [{ name: 'Internet Bulanan', price: 650000, cat: 'Bills' }] },
    { merchant: 'Ranch Market BSD', amount: 850000, date: '2026-09-04T15:30:00Z', items: [{ name: 'Kebutuhan Dapur', price: 850000, cat: 'Groceries' }] },
    { merchant: 'Pasar 8 Alam Sutera', amount: 320000, date: '2026-09-10T07:45:00Z', items: [{ name: 'Sayur Fresh', price: 320000, cat: 'Groceries' }] },
    { merchant: 'Gojek', amount: 42000, date: '2026-09-12T12:30:00Z', items: [{ name: 'GoCar', price: 42000, cat: 'Transport' }] },
    { merchant: 'Shell BSD', amount: 350000, date: '2026-09-15T08:20:00Z', items: [{ name: 'Bensin Super', price: 350000, cat: 'Transport' }] },
    { merchant: 'Chakra The Breeze', amount: 650000, date: '2026-09-16T19:30:00Z', items: [{ name: 'Dinner', price: 650000, cat: 'Food & Drink' }] },
    { merchant: 'Sejiwa BSD', amount: 120000, date: '2026-09-18T14:15:00Z', items: [{ name: 'Coffee & Cake', price: 120000, cat: 'Food & Drink' }] },
    { merchant: 'BP Gading Serpong', amount: 200000, date: '2026-09-20T09:00:00Z', items: [{ name: 'Bensin BP 92', price: 200000, cat: 'Transport' }] },
    { merchant: 'Dermaga Seafood', amount: 950000, date: '2026-09-21T19:00:00Z', items: [{ name: 'Seafood Keluarga', price: 950000, cat: 'Food & Drink' }] }
  ];

  await db.withTransactionAsync(async () => {
    for (const r of receipts) {
      const receiptId = randomUUID();
      const now = new Date().toISOString();
      await db.runAsync(
        "INSERT INTO receipts (id, merchant_name, total_amount, purchase_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [receiptId, r.merchant, r.amount, r.date, now, now]
      );
      
      for (const item of r.items) {
        const itemId = randomUUID();
        await db.runAsync(
          "INSERT INTO receipt_items (id, receipt_id, name, price, quantity, category, line_total) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [itemId, receiptId, item.name, item.price, 1, item.cat, item.price]
        );
      }
    }
  });

  console.log('Seeded realistic data successfully!');
}
