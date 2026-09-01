import * as SQLite from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { EditableReceiptItem, ReviewQueueItem, ReviewReason, PriceBookItem, PriceBookTransaction, RecurringRule, UpcomingBill } from '../types/receipt';
import { roundRupiah } from '../lib/money';
import { allocateReceiptTotalByCategory, TOTAL_MATCH_TOLERANCE } from '../lib/receiptMath';
import { evaluateReviewReasons } from '../lib/reviewQueue';
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
  merchantName?: string;
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
    ORDER BY r.purchase_date DESC, r.created_at DESC
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

  return Array.from(receipts.entries()).flatMap(([receiptId, receipt]) =>
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

export async function getReceiptsNeedingReview(db: SQLite.SQLiteDatabase): Promise<ReviewQueueItem[]> {
  await initDatabase(db);
  const rows = await db.getAllAsync<{
    id: string;
    merchant_name: string | null;
    total_amount: number;
    purchase_date: string;
    image_uri: string | null;
    items_sum: number;
    tax: number;
    service_charge: number;
    discount: number;
    unassigned_items_count: number;
    duplicate_count: number;
    is_shared_expense: number;
  }>(`
    WITH receipt_stats AS (
      SELECT receipt_id,
             SUM(line_total) as items_sum,
             SUM(CASE WHEN trim(category) = '' THEN 1 ELSE 0 END) as unassigned_items_count
      FROM receipt_items
      GROUP BY receipt_id
    ),
    duplicate_groups AS (
      SELECT trim(lower(merchant_name)) as norm_merchant, total_amount, purchase_date, COUNT(*) as count
      FROM receipts
      WHERE merchant_name IS NOT NULL AND trim(merchant_name) != ''
      GROUP BY trim(lower(merchant_name)), total_amount, purchase_date
      HAVING COUNT(*) > 1
    )
    SELECT r.id, r.merchant_name, r.total_amount, r.purchase_date, r.image_uri, r.tax, r.service_charge, r.discount, r.is_shared_expense,
      COALESCE(rs.items_sum, 0) as items_sum,
      COALESCE(rs.unassigned_items_count, 0) as unassigned_items_count,
      COALESCE(dg.count, 0) as duplicate_count
    FROM receipts r
    LEFT JOIN receipt_stats rs ON r.id = rs.receipt_id
    LEFT JOIN duplicate_groups dg
      ON trim(lower(r.merchant_name)) = dg.norm_merchant
      AND r.total_amount = dg.total_amount
      AND r.purchase_date = dg.purchase_date
    WHERE
      (trim(r.merchant_name) = '' OR r.merchant_name IS NULL)
      OR COALESCE(rs.unassigned_items_count, 0) > 0
      OR COALESCE(dg.count, 0) > 1
      OR ABS(COALESCE(rs.items_sum, 0) + r.tax + r.service_charge - r.discount - r.total_amount) > ${TOTAL_MATCH_TOLERANCE}
    ORDER BY r.purchase_date DESC, r.created_at DESC
  `);

  const results: ReviewQueueItem[] = [];

  for (const row of rows) {
    const reasons = evaluateReviewReasons(row);

    // Safety check: a receipt might have rounded perfectly but still caught by the SQL FLOAT quirk,
    // so we re-evaluate and only push if it's genuinely > TOTAL_MATCH_TOLERANCE difference, OR has other reasons.
    if (reasons.length > 0) {
      results.push({
        id: row.id,
        merchantName: row.merchant_name,
        totalAmount: row.total_amount,
        purchaseDate: row.purchase_date,
        imageUri: row.image_uri,
        isSharedExpense: row.is_shared_expense === 1,
        reasons,
      });
    }
  }

  return results;
}
export async function getPriceBookItems(db: SQLite.SQLiteDatabase, searchQuery: string = ''): Promise<PriceBookItem[]> {
  let query = `
    WITH ItemStats AS (
      SELECT
        lower(trim(ri.name)) as normalizedName,
        MAX(ri.name) as itemName,
        MAX(ri.category) as category,
        COUNT(r.id) as purchaseCount,
        MIN(ri.line_total * 1.0 / ri.quantity) as minPrice,
        MAX(ri.line_total * 1.0 / ri.quantity) as maxPrice,
        SUM(ri.line_total) * 1.0 / SUM(ri.quantity) as avgPrice,
        MAX(r.purchase_date) as lastPurchaseDate
      FROM receipt_items ri
      JOIN receipts r ON ri.receipt_id = r.id
      WHERE ri.line_total > 0 AND ri.quantity > 0 AND r.is_shared_expense = 0
      GROUP BY lower(trim(ri.name))
    ),
    LatestPrices AS (
      SELECT
        lower(trim(ri.name)) as normalizedName,
        (ri.line_total * 1.0 / ri.quantity) as lastPrice,
        ROW_NUMBER() OVER (PARTITION BY lower(trim(ri.name)) ORDER BY r.purchase_date DESC, r.created_at DESC) as rn
      FROM receipt_items ri
      JOIN receipts r ON ri.receipt_id = r.id
      WHERE ri.line_total > 0 AND ri.quantity > 0 AND r.is_shared_expense = 0
    )
    SELECT
      s.itemName,
      s.normalizedName,
      s.category,
      s.purchaseCount,
      ROUND(s.minPrice) as minPrice,
      ROUND(s.maxPrice) as maxPrice,
      ROUND(s.avgPrice) as avgPrice,
      s.lastPurchaseDate,
      ROUND(l.lastPrice) as lastPrice
    FROM ItemStats s
    JOIN LatestPrices l ON s.normalizedName = l.normalizedName AND l.rn = 1
  `;
  const params: any[] = [];

  if (searchQuery.trim().length > 0) {
    query += ' WHERE s.normalizedName LIKE ? OR lower(s.category) LIKE ?';
    const term = `%${searchQuery.trim().toLowerCase()}%`;
    params.push(term, term);
  }

  query += ' ORDER BY s.purchaseCount DESC, s.lastPurchaseDate DESC;';

  const rows = await db.getAllAsync<PriceBookItem>(query, params);
  return rows;
}

export async function getPriceBookItemHistory(db: SQLite.SQLiteDatabase, normalizedName: string): Promise<PriceBookTransaction[]> {
  const query = `
    SELECT
      r.id as receiptId,
      r.purchase_date as purchaseDate,
      r.merchant_name as merchantName,
      ROUND(ri.line_total * 1.0 / ri.quantity) as unitPrice,
      ri.quantity,
      ri.line_total as lineTotal
    FROM receipt_items ri
    JOIN receipts r ON ri.receipt_id = r.id
    WHERE lower(trim(ri.name)) = lower(trim(?)) AND ri.line_total > 0 AND ri.quantity > 0 AND r.is_shared_expense = 0
    ORDER BY r.purchase_date DESC, r.created_at DESC;
  `;
  return await db.getAllAsync<PriceBookTransaction>(query, [normalizedName]);
}


export async function getRecurringRules(db: SQLite.SQLiteDatabase): Promise<RecurringRule[]> {
  const rules = await db.getAllAsync<RecurringRule>('SELECT * FROM recurring_rules ORDER BY name ASC');
  
  // Fetch last paid date heuristically for each rule
  const receipts = await db.getAllAsync<{ merchant_name: string; total_amount: number; purchase_date: string; recurring_rule_id: string | null }>(
    'SELECT merchant_name, total_amount, purchase_date, recurring_rule_id FROM receipts ORDER BY purchase_date DESC'
  );
  
  return rules.map(rule => {
    const tolerance = rule.amount * 0.10;
    const minAmount = rule.amount - tolerance;
    const maxAmount = rule.amount + tolerance;
    const lowerRuleName = rule.name.toLowerCase().trim();
    
    let last_paid_date = null;
    for (const r of receipts) {
        if (r.recurring_rule_id === rule.id) {
          last_paid_date = r.purchase_date;
          break;
        }
        if (!r.recurring_rule_id && r.merchant_name && r.merchant_name.toLowerCase().includes(lowerRuleName)) {
          if (r.total_amount >= minAmount && r.total_amount <= maxAmount) {
            last_paid_date = r.purchase_date;
            break;
          }
        }
      }
    return { ...rule, last_paid_date };
  });
}

export async function addRecurringRule(db: SQLite.SQLiteDatabase, rule: Omit<RecurringRule, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO recurring_rules (id, name, amount, category, billing_date, is_active, frequency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, rule.name, rule.amount, rule.category, rule.billing_date, rule.is_active, rule.frequency || 'monthly', now, now]
  );
  return id;
}

export async function updateRecurringRule(db: SQLite.SQLiteDatabase, id: string, updates: Partial<RecurringRule>): Promise<void> {
  const current = await db.getFirstAsync<RecurringRule>('SELECT * FROM recurring_rules WHERE id = ?', [id]);
  if (!current) return;

  const name = updates.name !== undefined ? updates.name : current.name;
  const amount = updates.amount !== undefined ? updates.amount : current.amount;
  const category = updates.category !== undefined ? updates.category : current.category;
  const billing_date = updates.billing_date !== undefined ? updates.billing_date : current.billing_date;
  const is_active = updates.is_active !== undefined ? updates.is_active : current.is_active;
  const frequency = updates.frequency !== undefined ? updates.frequency : current.frequency;
  const now = new Date().toISOString();

  await db.runAsync(
    'UPDATE recurring_rules SET name = ?, amount = ?, category = ?, billing_date = ?, is_active = ?, frequency = ?, updated_at = ? WHERE id = ?',
    [name, amount, category, billing_date, is_active, frequency, now, id]
  );
}

export async function deleteRecurringRule(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM recurring_rules WHERE id = ?', [id]);
}

export async function getUpcomingBillsThisMonth(db: SQLite.SQLiteDatabase, year: number, month: number): Promise<UpcomingBill[]> {
  const rules = await db.getAllAsync<RecurringRule>('SELECT * FROM recurring_rules WHERE is_active = 1');
  
  // Pad month and year for LIKE query
  const monthStr = (month + 1).toString().padStart(2, '0');
  const monthPrefix = `${year}-${monthStr}-`;
  
  // Get all receipts for this month to check if paid. DO NOT INCLUDE SHARED EXPENSES.
  const receipts = await db.getAllAsync<{ id: string; merchant_name: string; total_amount: number; purchase_date: string; recurring_rule_id: string | null }>(
    'SELECT id, merchant_name, total_amount, purchase_date, recurring_rule_id FROM receipts WHERE purchase_date LIKE ? AND is_shared_expense = 0',
    [`${monthPrefix}%`]
  );
  
  const receiptItems = await db.getAllAsync<{ id: string; receipt_id: string; name: string; line_total: number; purchase_date: string }>(
    `SELECT i.id, i.receipt_id, i.name, i.line_total, r.purchase_date 
     FROM receipt_items i 
     JOIN receipts r ON i.receipt_id = r.id 
     WHERE r.purchase_date LIKE ? AND r.is_shared_expense = 0`,
    [`${monthPrefix}%`]
  );

  const usedReceiptIds = new Set<string>();
  const usedItemIds = new Set<string>();

  return rules.map(rule => {
    // Generate safe due date
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const safeDate = Math.min(rule.billing_date, daysInMonth);
    const dueDate = `${monthPrefix}${safeDate.toString().padStart(2, '0')}`;

    const tolerance = rule.amount * 0.10;
    const minAmount = rule.amount - tolerance;
    const maxAmount = rule.amount + tolerance;
    const lowerRuleName = rule.name.toLowerCase().trim();

    let isPaid = false;
    let paidDate: string | undefined;

    // Check receipt level
    for (const r of receipts) {
        if (usedReceiptIds.has(r.id)) continue;
        
        // Match by exact ID if available
        if (r.recurring_rule_id === rule.id) {
          isPaid = true;
          paidDate = r.purchase_date;
          usedReceiptIds.add(r.id);
          break;
        }

        // Heuristic fallback for older receipts without the ID
        if (!r.recurring_rule_id && r.merchant_name && r.merchant_name.toLowerCase().includes(lowerRuleName)) {
          if (r.total_amount >= minAmount && r.total_amount <= maxAmount) {
            isPaid = true;
            paidDate = r.purchase_date;
            usedReceiptIds.add(r.id);
            break;
          }
        }
      }

    // Check item level
    if (!isPaid) {
      for (const item of receiptItems) {
        if (usedItemIds.has(item.id)) continue;
        
        if (item.name.toLowerCase().includes(lowerRuleName)) {
          if (item.line_total >= minAmount && item.line_total <= maxAmount) {
            isPaid = true;
            paidDate = item.purchase_date;
            usedItemIds.add(item.id);
            break;
          }
        }
      }
    }

    // Calculate overdue
    let isOverdue = false;
    if (!isPaid) {
      const today = new Date();
      today.setHours(0,0,0,0);
      const d = new Date(dueDate);
      d.setHours(0,0,0,0);
      if (d.getTime() < today.getTime()) {
        isOverdue = true;
      }
    }

    return { rule, isPaid, dueDate, isOverdue, paidDate };
  });
}


export interface RecurringSuggestion {
  name: string;
  amount: number;
  category: string;
  occurrences: number;
  lastDate: string;
  firstDate: string;
}

export async function getRecurringSuggestions(db: SQLite.SQLiteDatabase): Promise<RecurringSuggestion[]> {
  // Finds items with same name, similar amount (+/- 10%), occurring >= 2 times in different months
  // Skips items already managed in recurring_rules
  
  const query = `
    WITH ItemStats AS (
      SELECT 
        LOWER(TRIM(i.name)) as clean_name,
        MAX(i.name) as display_name,
        i.category,
        AVG(i.line_total) as avg_amount,
        COUNT(DISTINCT strftime('%Y-%m', r.purchase_date)) as unique_months,
        MAX(r.purchase_date) as last_date, MIN(r.purchase_date) as first_date
      FROM receipt_items i
      JOIN receipts r ON i.receipt_id = r.id
      
      WHERE r.is_shared_expense = 0
      AND i.line_total >= 10000
      AND LOWER(TRIM(i.name)) NOT IN ('kantong plastik', 'plastik', 'ongkir', 'service charge', 'tax', 'pajak', 'admin', 'biaya admin', 'donasi', 'parkir', 'parking', 'shopping bag')
      AND LOWER(TRIM(i.name)) NOT LIKE '%kresek%'
      AND LOWER(TRIM(i.name)) NOT LIKE '%plastik%'
      GROUP BY LOWER(TRIM(i.name)), i.category
      HAVING unique_months >= 2
    )
    SELECT * FROM ItemStats
    WHERE NOT EXISTS (
      SELECT 1 FROM recurring_rules rr 
      WHERE LOWER(TRIM(rr.name)) = clean_name OR LOWER(TRIM(rr.name)) = LOWER(TRIM(display_name))
    )
    ORDER BY unique_months DESC, last_date DESC
  `;
  
  const rows = await db.getAllAsync<any>(query);
  return rows.map(r => ({
    name: r.display_name,
    amount: Math.round(r.avg_amount),
    category: r.category,
    occurrences: r.unique_months,
    lastDate: r.last_date,
    firstDate: r.first_date
  }));
}


export async function getMonthlyItemSpend(
  db: SQLite.SQLiteDatabase,
  startDate: string,
  endDate: string
): Promise<ItemSpendRecord[]> {
  await initDatabase(db);
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
    WHERE r.purchase_date >= ? AND r.purchase_date <= ?
  `, [startDate, endDate]);

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

  return Array.from(receipts.entries()).flatMap(([receiptId, receipt]) =>
    allocateReceiptTotalByCategory(receipt.items, receipt.totalAmount).map((allocation) => ({
      receiptId,
      purchaseDate: receipt.purchaseDate,
      category: allocation.category,
      amount: allocation.amount,
    }))
  );
}

export interface TopMerchant {
  merchantName: string;
  totalAmount: number;
  visitCount: number;
}

export async function getTopMerchants(
  db: SQLite.SQLiteDatabase,
  startDate: string,
  endDate: string,
  orderBy: 'spending' | 'frequency' = 'spending'
): Promise<TopMerchant[]> {
  await initDatabase(db);
  const orderClause = orderBy === 'spending' ? 'totalAmount DESC' : 'visitCount DESC, totalAmount DESC';
  
  const rows = await db.getAllAsync<{
    merchantName: string;
    totalAmount: number;
    visitCount: number;
  }>(`
    SELECT 
      TRIM(merchant_name) as merchantName,
      SUM(total_amount) as totalAmount,
      COUNT(id) as visitCount
    FROM receipts
    WHERE purchase_date >= ? AND purchase_date <= ?
    GROUP BY LOWER(TRIM(merchant_name))
    ORDER BY ${orderClause}
    LIMIT 20
  `, [startDate, endDate]);
  
  return rows;
}

export async function getMerchantSummary(
  db: SQLite.SQLiteDatabase,
  merchantName: string,
  startDate: string,
  endDate: string
) {
  await initDatabase(db);
  // Using LIKE for case-insensitive match on merchant name
  const row = await db.getFirstAsync<{
    totalAmount: number;
    visitCount: number;
  }>(`
    SELECT 
      SUM(total_amount) as totalAmount,
      COUNT(id) as visitCount
    FROM receipts
    WHERE LOWER(TRIM(merchant_name)) = LOWER(TRIM(?))
      AND purchase_date >= ? AND purchase_date <= ?
  `, [merchantName, startDate, endDate]);
  
  return row || { totalAmount: 0, visitCount: 0 };
}

export async function getMerchantTransactions(
  db: SQLite.SQLiteDatabase,
  merchantName: string,
  startDate: string,
  endDate: string
): Promise<ReceiptSummary[]> {
  await initDatabase(db);
  return getAllReceipts(db, {
    startDate,
    endDate,
    merchantName: merchantName // We'll rely on the searchQuery or strict merchant filtering. 
    // Actually getAllReceipts searchQuery uses LIKE on merchant_name OR items.
  });
}


export async function getBiggestExpenses(
  db: SQLite.SQLiteDatabase,
  startDate: string,
  endDate: string,
  limit: number = 5
): Promise<ReceiptSummary[]> {
  await initDatabase(db);
  const rows = await db.getAllAsync<any>(`
    SELECT 
      r.id,
      r.merchant_name,
      r.total_amount,
      r.purchase_date,
      r.source_type,
      r.image_uri,
      (SELECT COUNT(id) FROM receipt_items WHERE receipt_id = r.id) as item_count,
      GROUP_CONCAT(ri.category) as categories
    FROM receipts r
    LEFT JOIN receipt_items ri ON r.id = ri.receipt_id
    WHERE r.purchase_date >= ? AND r.purchase_date <= ?
    GROUP BY r.id
    ORDER BY r.total_amount DESC
    LIMIT ?
  `, [startDate, endDate, limit]);

  return rows.map(row => {
    const cats = row.categories ? row.categories.split(',') : [];
    return {
      id: row.id,
      merchantName: row.merchant_name,
      totalAmount: row.total_amount,
      purchaseDate: row.purchase_date,
      itemCount: row.item_count,
      sourceType: row.source_type,
      imageUri: row.image_uri,
      categories: Array.from(new Set(cats))
    } as ReceiptSummary;
  });
}
