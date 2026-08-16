import * as SQLite from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { EditableReceiptItem } from '../types/receipt';

export interface ReceiptSummary {
  id: string;
  merchantName: string | null;
  purchaseDate: string;
  totalAmount: number;
  itemCount: number;
  categories: string[];
  sourceType: string;
}

export interface ReceiptItemDetail {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
}

export interface ReceiptDetail {
  id: string;
  merchantName: string | null;
  purchaseDate: string;
  totalAmount: number;
  tax: number;
  serviceCharge: number;
  items: ReceiptItemDetail[];
  sourceType: string;
}

export interface ItemSpendRecord {
  category: string;
  purchaseDate: string;
  amount: number;
}

export interface CategoryItemDetail {
  id: string;
  name: string;
  price: number;
  quantity: number;
  purchaseDate: string;
  merchantName: string | null;
}

export async function getAllReceipts(db: SQLite.SQLiteDatabase): Promise<ReceiptSummary[]> {
  const rows = await db.getAllAsync<{
    id: string;
    merchantName: string | null;
    purchaseDate: string;
    totalAmount: number;
    itemCount: number;
    categoriesRaw: string | null;
    sourceType: string;
  }>(`
    SELECT
      r.id as id,
      r.merchant_name as merchantName,
      r.purchase_date as purchaseDate,
      r.total_amount as totalAmount,
      COUNT(ri.id) as itemCount,
      GROUP_CONCAT(DISTINCT NULLIF(ri.category, '')) as categoriesRaw,
      r.source_type as sourceType
    FROM receipts r
    LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
    GROUP BY r.id
    ORDER BY r.purchase_date DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    merchantName: row.merchantName,
    purchaseDate: row.purchaseDate,
    totalAmount: row.totalAmount,
    itemCount: row.itemCount,
    categories: row.categoriesRaw ? row.categoriesRaw.split(',') : [],
    sourceType: row.sourceType,
  }));
}

export async function getReceiptDetail(
  db: SQLite.SQLiteDatabase,
  receiptId: string
): Promise<ReceiptDetail | null> {
  const receipt = await db.getFirstAsync<{
    id: string;
    merchant_name: string | null;
    purchase_date: string;
    total_amount: number;
    tax: number | null;
    service_charge: number | null;
    source_type: string;
  }>(`SELECT id, merchant_name, purchase_date, total_amount, tax, service_charge, source_type FROM receipts WHERE id = ?`, [receiptId]);
  if (!receipt) return null;

  const items = await db.getAllAsync<ReceiptItemDetail>(
    `SELECT id, name, price, quantity, category FROM receipt_items WHERE receipt_id = ?`,
    [receiptId]
  );

  return {
    id: receipt.id,
    merchantName: receipt.merchant_name,
    purchaseDate: receipt.purchase_date,
    totalAmount: receipt.total_amount,
    tax: receipt.tax ?? 0,
    serviceCharge: receipt.service_charge ?? 0,
    items,
    sourceType: receipt.source_type,
  };
}

export async function getAllItemSpend(db: SQLite.SQLiteDatabase): Promise<ItemSpendRecord[]> {
  const rows = await db.getAllAsync<ItemSpendRecord>(`
    SELECT
      ri.category as category,
      r.purchase_date as purchaseDate,
      ri.price * ri.quantity as amount
    FROM receipt_items ri
    JOIN receipts r ON ri.receipt_id = r.id
  `);
  return rows;
}

export async function getItemsByCategory(
  db: SQLite.SQLiteDatabase,
  category: string,
  monthStart: string,
  monthEnd: string
): Promise<CategoryItemDetail[]> {
  const categoryFilter =
    category === 'Other' ? `(ri.category = '' OR ri.category = 'Other')` : `ri.category = ?`;
  const params = category === 'Other' ? [monthStart, monthEnd] : [category, monthStart, monthEnd];

  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    purchaseDate: string;
    merchantName: string | null;
  }>(
    `SELECT ri.id, ri.name, ri.price, ri.quantity, r.purchase_date as purchaseDate, r.merchant_name as merchantName
     FROM receipt_items ri
     JOIN receipts r ON ri.receipt_id = r.id
     WHERE ${categoryFilter} AND r.purchase_date >= ? AND r.purchase_date < ?
     ORDER BY r.purchase_date DESC`,
    params
  );
  return rows;
}

export interface MerchantSummary {
  merchantName: string;
  totalAmount: number;
  visitCount: number;
  lastPurchaseDate: string;
}

export interface MerchantReceiptItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
}

export interface MerchantReceiptDetail {
  id: string;
  purchaseDate: string;
  totalAmount: number;
  tax: number;
  serviceCharge: number;
  items: MerchantReceiptItem[];
}

export async function getTopMerchantsThisMonth(
  db: SQLite.SQLiteDatabase,
  monthStart: string,
  monthEnd: string
): Promise<MerchantSummary[]> {
  const rows = await db.getAllAsync<{
    merchantName: string | null;
    totalAmount: number;
    visitCount: number;
    lastPurchaseDate: string;
  }>(
    `SELECT 
       COALESCE(NULLIF(TRIM(merchant_name), ''), 'Unknown Store') as merchantName,
       SUM(total_amount) as totalAmount,
       COUNT(id) as visitCount,
       MAX(purchase_date) as lastPurchaseDate
     FROM receipts
     WHERE purchase_date >= ? AND purchase_date < ?
     GROUP BY merchantName
     ORDER BY totalAmount DESC
     LIMIT 5`,
    [monthStart, monthEnd]
  );

  return rows.map((row) => ({
    merchantName: row.merchantName || 'Unknown Store',
    totalAmount: row.totalAmount,
    visitCount: row.visitCount,
    lastPurchaseDate: row.lastPurchaseDate,
  }));
}

export async function getMerchantReceipts(
  db: SQLite.SQLiteDatabase,
  merchantName: string
): Promise<MerchantReceiptDetail[]> {
  const isUnknown = merchantName === 'Unknown Store' || merchantName === '';
  const filter = isUnknown
    ? `(r.merchant_name IS NULL OR TRIM(r.merchant_name) = '' OR r.merchant_name = 'Unknown Store')`
    : `TRIM(r.merchant_name) = ?`;
  const params = isUnknown ? [] : [merchantName.trim()];

  const rows = await db.getAllAsync<{
    receipt_id: string;
    purchase_date: string;
    total_amount: number;
    tax: number | null;
    service_charge: number | null;
    item_id: string | null;
    item_name: string | null;
    item_price: number | null;
    item_quantity: number | null;
    item_category: string | null;
  }>(
    `SELECT 
       r.id as receipt_id, 
       r.purchase_date, 
       r.total_amount, 
       r.tax, 
       r.service_charge,
       ri.id as item_id,
       ri.name as item_name,
       ri.price as item_price,
       ri.quantity as item_quantity,
       ri.category as item_category
     FROM receipts r
     LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
     WHERE ${filter}
     ORDER BY r.purchase_date DESC`,
    params
  );

  const receiptMap = new Map<string, MerchantReceiptDetail>();

  for (const row of rows) {
    if (!receiptMap.has(row.receipt_id)) {
      receiptMap.set(row.receipt_id, {
        id: row.receipt_id,
        purchaseDate: row.purchase_date,
        totalAmount: row.total_amount,
        tax: row.tax ?? 0,
        serviceCharge: row.service_charge ?? 0,
        items: [],
      });
    }

    if (row.item_id) {
      receiptMap.get(row.receipt_id)!.items.push({
        id: row.item_id,
        name: row.item_name!,
        price: row.item_price!,
        quantity: row.item_quantity!,
        category: row.item_category!,
      });
    }
  }

  return Array.from(receiptMap.values());
}

export async function saveReceipt(
  db: SQLite.SQLiteDatabase,
  purchaseDate: string,
  items: EditableReceiptItem[],
  merchantName: string | null,
  tax: number = 0,
  serviceCharge: number = 0,
  sourceType: string = 'receipt'
): Promise<string> {
  const receiptId = randomUUID();
  const createdAt = new Date().toISOString();
  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalAmount = itemsTotal + tax + serviceCharge;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO receipts (id, merchant_name, total_amount, purchase_date, created_at, tax, service_charge, source_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [receiptId, merchantName, totalAmount, purchaseDate, createdAt, tax, serviceCharge, sourceType]
    );

    for (const item of items) {
      await db.runAsync(
        `INSERT INTO receipt_items (id, receipt_id, name, price, quantity, category)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), receiptId, item.name, item.price, item.quantity, item.category]
      );
    }
  });

  return receiptId;
}

export async function updateReceipt(
  db: SQLite.SQLiteDatabase,
  receiptId: string,
  purchaseDate: string,
  items: EditableReceiptItem[],
  merchantName: string | null,
  tax: number = 0,
  serviceCharge: number = 0,
  sourceType: string = 'receipt'
): Promise<void> {
  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalAmount = itemsTotal + tax + serviceCharge;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE receipts SET merchant_name = ?, total_amount = ?, purchase_date = ?, tax = ?, service_charge = ?, source_type = ? WHERE id = ?`,
      [merchantName, totalAmount, purchaseDate, tax, serviceCharge, sourceType, receiptId]
    );
    await db.runAsync(`DELETE FROM receipt_items WHERE receipt_id = ?`, [receiptId]);
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO receipt_items (id, receipt_id, name, price, quantity, category)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), receiptId, item.name, item.price, item.quantity, item.category]
      );
    }
  });
}

export async function deleteReceipt(db: SQLite.SQLiteDatabase, receiptId: string): Promise<void> {
  await db.runAsync(`DELETE FROM receipts WHERE id = ?`, [receiptId]);
}

export async function getBudgets(db: SQLite.SQLiteDatabase): Promise<Record<string, number>> {
  const rows = await db.getAllAsync<{ category: string; monthly_limit: number }>(
    `SELECT category, monthly_limit FROM budgets`
  );
  const result: Record<string, number> = {};
  for (const row of rows) result[row.category] = row.monthly_limit;
  return result;
}

export async function setBudgets(
  db: SQLite.SQLiteDatabase,
  budgets: Record<string, number | null>
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const [category, limit] of Object.entries(budgets)) {
      if (limit === null || limit <= 0) {
        await db.runAsync(`DELETE FROM budgets WHERE category = ?`, [category]);
      } else {
        await db.runAsync(
          `INSERT INTO budgets (category, monthly_limit) VALUES (?, ?)
           ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
          [category, limit]
        );
      }
    }
  });
}

