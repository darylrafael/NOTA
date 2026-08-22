import * as SQLite from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { EditableReceiptItem } from '../types/receipt';
import { roundRupiah } from '../lib/money';
import { allocateReceiptTotalByCategory } from '../lib/receiptMath';
import { validateReceiptWrite } from '../lib/receiptWrite';
import { initDatabase } from './schema';

function resolveLineTotal(lineTotal: number | null | undefined, price: number, quantity: number): number {
  if (typeof lineTotal === 'number' && lineTotal > 0) return roundRupiah(lineTotal);
  return roundRupiah(price * quantity);
}

export interface ReceiptSummary {
  id: string;
  merchantName: string | null;
  purchaseDate: string;
  totalAmount: number;
  itemCount: number;
  categories: string[];
  sourceType: string;
  imageUri: string | null;
}

export interface ReceiptItemDetail {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  lineTotal: number;
}

export interface ReceiptDetail {
  id: string;
  merchantName: string | null;
  purchaseDate: string;
  totalAmount: number;
  tax: number;
  serviceCharge: number;
  discount: number;
  items: ReceiptItemDetail[];
  sourceType: string;
  imageUri: string | null;
  isSharedExpense?: boolean;
  originalReceiptData?: string | null;
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
  lineTotal: number;
  purchaseDate: string;
  merchantName: string | null;
}

export interface ReceiptFilter {
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
}

export async function getAllReceipts(
  db: SQLite.SQLiteDatabase,
  filters?: ReceiptFilter
): Promise<ReceiptSummary[]> {
  await initDatabase(db);
  
  let baseQuery = `
    SELECT
      r.id as id,
      r.merchant_name as merchantName,
      r.purchase_date as purchaseDate,
      r.total_amount as totalAmount,
      COUNT(ri.id) as itemCount,
      GROUP_CONCAT(DISTINCT NULLIF(ri.category, '')) as categoriesRaw,
      r.source_type as sourceType,
      r.image_uri as imageUri
    FROM receipts r
    LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
  `;

  const whereClauses: string[] = [];
  const params: any[] = [];

  if (filters?.searchQuery && filters.searchQuery.trim().length > 0) {
    const searchParam = `%${filters.searchQuery.trim()}%`;
    whereClauses.push(`(
      r.merchant_name LIKE ? OR 
      EXISTS (
        SELECT 1 FROM receipt_items search_ri 
        WHERE search_ri.receipt_id = r.id 
        AND search_ri.name LIKE ?
      )
    )`);
    params.push(searchParam, searchParam);
  }

  if (filters?.startDate) {
    whereClauses.push(`r.purchase_date >= ?`);
    params.push(filters.startDate);
  }

  if (filters?.endDate) {
    whereClauses.push(`r.purchase_date <= ?`);
    params.push(filters.endDate);
  }

  if (filters?.category && filters.category !== 'All') {
    whereClauses.push(`
      EXISTS (
        SELECT 1 FROM receipt_items cat_ri 
        WHERE cat_ri.receipt_id = r.id 
        AND cat_ri.category = ?
      )
    `);
    params.push(filters.category);
  }

  if (whereClauses.length > 0) {
    baseQuery += ` WHERE ` + whereClauses.join(' AND ');
  }

  baseQuery += `
    GROUP BY r.id
    ORDER BY COALESCE(NULLIF(r.created_at, ''), r.updated_at, r.purchase_date) DESC, r.purchase_date DESC
  `;

  const rows = await db.getAllAsync<{
    id: string;
    merchantName: string | null;
    purchaseDate: string;
    totalAmount: number;
    itemCount: number;
    categoriesRaw: string | null;
    sourceType: string;
    imageUri: string | null;
  }>(baseQuery, params);

  return rows.map((row) => ({
    id: row.id,
    merchantName: row.merchantName,
    purchaseDate: row.purchaseDate,
    totalAmount: row.totalAmount,
    itemCount: row.itemCount,
    categories: row.categoriesRaw ? row.categoriesRaw.split(',') : [],
    sourceType: row.sourceType,
    imageUri: row.imageUri,
  }));
}

export async function getTotalReceiptCount(db: SQLite.SQLiteDatabase): Promise<number> {
  const result = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM receipts`);
  return result?.count ?? 0;
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
    discount: number | null;
    source_type: string;
    image_uri: string | null;
    is_shared_expense: number;
    original_receipt_data: string | null;
  }>(
    `SELECT id, merchant_name, purchase_date, total_amount, tax, service_charge, discount, source_type, image_uri, is_shared_expense, original_receipt_data FROM receipts WHERE id = ?`,
    [receiptId]
  );
  if (!receipt) return null;

  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    category: string;
    line_total: number | null;
  }>(`SELECT id, name, price, quantity, category, line_total FROM receipt_items WHERE receipt_id = ?`, [receiptId]);

  const items: ReceiptItemDetail[] = rows.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    category: item.category,
    lineTotal: resolveLineTotal(item.line_total, item.price, item.quantity),
  }));

  return {
    id: receipt.id,
    merchantName: receipt.merchant_name,
    purchaseDate: receipt.purchase_date,
    totalAmount: receipt.total_amount,
    tax: receipt.tax ?? 0,
    serviceCharge: receipt.service_charge ?? 0,
    discount: receipt.discount ?? 0,
    items,
    sourceType: receipt.source_type,
    imageUri: receipt.image_uri,
    isSharedExpense: !!receipt.is_shared_expense,
    originalReceiptData: receipt.original_receipt_data,
  };
}

export async function getAllItemSpend(db: SQLite.SQLiteDatabase): Promise<ItemSpendRecord[]> {
  const rows = await db.getAllAsync<{
    receiptId: string;
    category: string;
    purchaseDate: string;
    lineTotal: number;
    totalAmount: number;
  }>(`
    SELECT
      r.id as receiptId,
      ri.category as category,
      r.purchase_date as purchaseDate,
      COALESCE(NULLIF(ri.line_total, 0), ri.price * ri.quantity) as lineTotal,
      r.total_amount as totalAmount
    FROM receipt_items ri
    JOIN receipts r ON ri.receipt_id = r.id
  `);

  const receipts = new Map<string, {
    purchaseDate: string;
    totalAmount: number;
    items: { category: string; lineTotal: number }[];
  }>();

  for (const row of rows) {
    const receipt = receipts.get(row.receiptId) ?? {
      purchaseDate: row.purchaseDate,
      totalAmount: row.totalAmount,
      items: [],
    };
    receipt.items.push({ category: row.category, lineTotal: row.lineTotal });
    receipts.set(row.receiptId, receipt);
  }

  return Array.from(receipts.values()).flatMap((receipt) =>
    allocateReceiptTotalByCategory(receipt.items, receipt.totalAmount).map((allocation) => ({
      category: allocation.category,
      purchaseDate: receipt.purchaseDate,
      amount: allocation.amount,
    }))
  );
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
    line_total: number | null;
    purchaseDate: string;
    merchantName: string | null;
  }>(
    `SELECT ri.id, ri.name, ri.price, ri.quantity, ri.line_total, r.purchase_date as purchaseDate, r.merchant_name as merchantName
     FROM receipt_items ri
     JOIN receipts r ON ri.receipt_id = r.id
     WHERE ${categoryFilter} AND r.purchase_date >= ? AND r.purchase_date < ?
     ORDER BY r.created_at DESC, r.purchase_date DESC`,
    params
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    price: row.price,
    quantity: row.quantity,
    lineTotal: resolveLineTotal(row.line_total, row.price, row.quantity),
    purchaseDate: row.purchaseDate,
    merchantName: row.merchantName,
  }));
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
  lineTotal: number;
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
    item_line_total: number | null;
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
       ri.category as item_category,
       ri.line_total as item_line_total
     FROM receipts r
     LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
     WHERE ${filter}
     ORDER BY r.created_at DESC, r.purchase_date DESC`,
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
      const price = row.item_price ?? 0;
      const quantity = row.item_quantity ?? 1;
      receiptMap.get(row.receipt_id)!.items.push({
        id: row.item_id,
        name: row.item_name!,
        price,
        quantity,
        category: row.item_category!,
        lineTotal: resolveLineTotal(row.item_line_total, price, quantity),
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
  sourceType: string = 'receipt',
  discount: number = 0,
  imageUri: string | null = null
): Promise<string> {
  await initDatabase(db);
  const validated = validateReceiptWrite({ purchaseDate, items, tax, serviceCharge, discount });
  const receiptId = randomUUID();
  const createdAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO receipts (id, merchant_name, total_amount, purchase_date, created_at, updated_at, tax, service_charge, source_type, discount, image_uri)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        receiptId,
        merchantName,
        validated.totalAmount,
        validated.purchaseDate,
        createdAt,
        createdAt,
        validated.tax,
        validated.serviceCharge,
        sourceType,
        validated.discount,
        imageUri,
      ]
    );

    for (const item of items) {
      await db.runAsync(
        `INSERT INTO receipt_items (id, receipt_id, name, price, quantity, category, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          receiptId,
          item.name.trim(),
          roundRupiah(item.price),
          item.quantity,
          item.category,
          roundRupiah(item.lineTotal),
        ]
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
  sourceType: string = 'receipt',
  discount: number = 0
): Promise<void> {
  await initDatabase(db);
  const validated = validateReceiptWrite({ purchaseDate, items, tax, serviceCharge, discount });
  const updatedAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE receipts
       SET merchant_name = ?, total_amount = ?, purchase_date = ?, updated_at = ?, tax = ?, service_charge = ?, source_type = ?, discount = ?
       WHERE id = ?`,
      [
        merchantName,
        validated.totalAmount,
        validated.purchaseDate,
        updatedAt,
        validated.tax,
        validated.serviceCharge,
        sourceType,
        validated.discount,
        receiptId,
      ]
    );
    await db.runAsync(`DELETE FROM receipt_items WHERE receipt_id = ?`, [receiptId]);
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO receipt_items (id, receipt_id, name, price, quantity, category, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          receiptId,
          item.name.trim(),
          roundRupiah(item.price),
          item.quantity,
          item.category,
          roundRupiah(item.lineTotal),
        ]
      );
    }
  });
}

export async function convertToSharedExpense(
  db: SQLite.SQLiteDatabase,
  originalReceipt: ReceiptDetail,
  personalItems: EditableReceiptItem[],
  personalTax: number,
  personalServiceCharge: number,
  personalDiscount: number
): Promise<void> {
  await initDatabase(db);
  const validated = validateReceiptWrite({ 
    purchaseDate: originalReceipt.purchaseDate, 
    items: personalItems, 
    tax: personalTax, 
    serviceCharge: personalServiceCharge, 
    discount: personalDiscount 
  });
  
  const updatedAt = new Date().toISOString();
  // Idempotency: if it's already a shared expense, keep the FIRST original receipt data.
  // Otherwise, we stringify the current receipt state to save it as the original.
  const originalDataJson = originalReceipt.originalReceiptData || JSON.stringify(originalReceipt);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE receipts
       SET total_amount = ?, updated_at = ?, tax = ?, service_charge = ?, discount = ?, 
           is_shared_expense = 1, original_receipt_data = ?
       WHERE id = ?`,
      [
        validated.totalAmount,
        updatedAt,
        validated.tax,
        validated.serviceCharge,
        validated.discount,
        originalDataJson,
        originalReceipt.id,
      ]
    );
    await db.runAsync(`DELETE FROM receipt_items WHERE receipt_id = ?`, [originalReceipt.id]);
    for (const item of personalItems) {
      await db.runAsync(
        `INSERT INTO receipt_items (id, receipt_id, name, price, quantity, category, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          originalReceipt.id,
          item.name.trim(),
          roundRupiah(item.price),
          item.quantity,
          item.category,
          roundRupiah(item.lineTotal),
        ]
      );
    }
  });
}

export async function deleteReceipt(db: SQLite.SQLiteDatabase, receiptId: string): Promise<void> {
  const receipt = await db.getFirstAsync<{ image_uri: string | null }>(
    `SELECT image_uri FROM receipts WHERE id = ?`,
    [receiptId]
  );
  
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM receipt_items WHERE receipt_id = ?`, [receiptId]);
    await db.runAsync(`DELETE FROM receipts WHERE id = ?`, [receiptId]);
  });

  if (receipt?.image_uri) {
    try {
      const FileSystem = require('expo-file-system/legacy');
      await FileSystem.deleteAsync(receipt.image_uri, { idempotent: true });
    } catch (e) {
      console.warn('Failed to delete associated receipt image:', e);
    }
  }
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

// ----------------------------------------------------------------------------
// MERCHANT PREFERENCES (PHASE 4)
// ----------------------------------------------------------------------------

export interface MerchantPreference {
  merchantName: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export async function getMerchantPreference(
  db: SQLite.SQLiteDatabase,
  merchantName: string
): Promise<string | null> {
  const key = merchantName.trim().toLowerCase();
  if (!key) return null;

  try {
    const row = await db.getFirstAsync<{ category: string }>(
      `SELECT category FROM merchant_preferences WHERE LOWER(merchant_name) = ?`,
      [key]
    );
    return row?.category || null;
  } catch (err) {
    console.error('Error getting merchant preference:', err);
    return null;
  }
}

export async function saveMerchantPreference(
  db: SQLite.SQLiteDatabase,
  merchantName: string,
  category: string
): Promise<void> {
  const key = merchantName.trim().toLowerCase();
  if (!key || !category) return;

  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO merchant_preferences (merchant_name, category, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(merchant_name) DO UPDATE SET 
       category = excluded.category,
       updated_at = excluded.updated_at`,
    [key, category, now, now]
  );
}

export async function getAllMerchantPreferences(
  db: SQLite.SQLiteDatabase
): Promise<MerchantPreference[]> {
  const rows = await db.getAllAsync<{
    merchant_name: string;
    category: string;
    created_at: string;
    updated_at: string;
  }>(`SELECT * FROM merchant_preferences ORDER BY merchant_name ASC`);
  
  return rows.map(r => ({
    merchantName: r.merchant_name,
    category: r.category,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

export async function deleteMerchantPreference(
  db: SQLite.SQLiteDatabase,
  merchantName: string
): Promise<void> {
  const key = merchantName.trim().toLowerCase();
  if (!key) return;
  await db.runAsync(`DELETE FROM merchant_preferences WHERE LOWER(merchant_name) = ?`, [key]);
}
