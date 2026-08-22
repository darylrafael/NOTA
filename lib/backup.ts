import { SQLiteDatabase } from 'expo-sqlite';

export interface Receipt {
  id: string;
  merchant_name: string;
  total_amount: number;
  purchase_date: string;
  created_at: string;
  updated_at: string;
  tax: number;
  service_charge: number;
  source_type: string;
  discount: number;
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  line_total: number;
}

interface BackupData {
  backupVersion: number;
  schemaVersion: number;
  createdAt: string;
  receipts: Receipt[];
  receiptItems: ReceiptItem[];
  budgets: { category: string; monthly_limit: number }[];
  merchantPreferences?: { merchant_name: string; category: string; created_at: string; updated_at: string }[];
}

export async function exportToCsv(db: SQLiteDatabase): Promise<string> {
  const receipts = await db.getAllAsync<Receipt>('SELECT * FROM receipts ORDER BY purchase_date DESC');
  const items = await db.getAllAsync<ReceiptItem>('SELECT * FROM receipt_items');

  const headers = [
    'Receipt ID', 'Purchase Date', 'Merchant', 'Source Type', 'Receipt Tax', 'Receipt Service Charge', 'Receipt Discount', 'Receipt Total',
    'Is Shared', 'Original Data',
    'Item ID', 'Item Name', 'Category', 'Quantity', 'Unit Price', 'Line Total'
  ];

  const rows: string[] = [headers.join(',')];

  for (const receipt of receipts) {
    const receiptItems = items.filter(i => i.receipt_id === receipt.id);
    const isShared = (receipt as any).is_shared_expense === 1 ? 'Yes' : 'No';
    const origData = (receipt as any).original_receipt_data ? `"${(receipt as any).original_receipt_data.replace(/"/g, '""')}"` : '';
    
    if (receiptItems.length === 0) {
      // Empty receipt
      const row = [
        receipt.id, receipt.purchase_date, `"${receipt.merchant_name || ''}"`, receipt.source_type,
        receipt.tax, receipt.service_charge, receipt.discount, receipt.total_amount,
        isShared, origData,
        '', '', '', '', '', ''
      ];
      rows.push(row.join(','));
    } else {
      for (const item of receiptItems) {
        const row = [
          receipt.id, receipt.purchase_date, `"${receipt.merchant_name || ''}"`, receipt.source_type,
          receipt.tax, receipt.service_charge, receipt.discount, receipt.total_amount,
          isShared, origData,
          item.id, `"${item.name}"`, `"${item.category}"`, item.quantity, item.price, item.line_total
        ];
        rows.push(row.join(','));
      }
    }
  }

  return rows.join('\n');
}

export async function exportToJson(db: SQLiteDatabase): Promise<string> {
  const { user_version } = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version') || { user_version: 1 };
  const receipts = await db.getAllAsync<Receipt>('SELECT * FROM receipts');
  const receiptItems = await db.getAllAsync<ReceiptItem>('SELECT * FROM receipt_items');
  const budgets = await db.getAllAsync<{ category: string; monthly_limit: number }>('SELECT * FROM budgets');
  let merchantPreferences: any[] = [];
  if (user_version >= 3) {
    merchantPreferences = await db.getAllAsync('SELECT * FROM merchant_preferences');
  }

  const backup: BackupData = {
    backupVersion: 1,
    schemaVersion: user_version,
    createdAt: new Date().toISOString(),
    receipts,
    receiptItems,
    budgets,
    merchantPreferences,
  };

  return JSON.stringify(backup, null, 2);
}

export async function restoreFromJson(db: SQLiteDatabase, jsonString: string): Promise<void> {
  const data = JSON.parse(jsonString) as Partial<BackupData>;

  if (data.backupVersion !== 1) {
    throw new Error('Unsupported backup version.');
  }

  if (!Array.isArray(data.receipts) || !Array.isArray(data.receiptItems) || !Array.isArray(data.budgets)) {
    throw new Error('Invalid backup format. Missing required arrays.');
  }

  // Validate relationships and schemas broadly to avoid partial restores
  const receipts = data.receipts as Receipt[];
  const receiptItems = data.receiptItems as ReceiptItem[];
  const budgets = data.budgets as { category: string; monthly_limit: number }[];
  const merchantPreferences = Array.isArray(data.merchantPreferences) ? data.merchantPreferences : [];

  const receiptIds = new Set(receipts.map(r => r.id));
  for (const item of receiptItems) {
    if (!receiptIds.has(item.receipt_id)) {
      throw new Error(`Orphaned receipt item found: ${item.name}`);
    }
  }

  // Execute restore in a transaction
  await db.withTransactionAsync(async () => {
    // 1. Wipe existing data
    await db.execAsync('DELETE FROM receipt_items; DELETE FROM receipts; DELETE FROM budgets;');
    const { user_version } = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version') || { user_version: 1 };
    if (user_version >= 3) {
      await db.execAsync('DELETE FROM merchant_preferences;');
    }

    // 2. Restore receipts
    for (const r of receipts) {
      await db.runAsync(
        `INSERT INTO receipts (id, merchant_name, total_amount, purchase_date, created_at, updated_at, tax, service_charge, source_type, discount, image_uri, is_shared_expense, original_receipt_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.id, r.merchant_name, r.total_amount, r.purchase_date, r.created_at, r.updated_at, 
          r.tax || 0, r.service_charge || 0, r.source_type || 'receipt', r.discount || 0, 
          (r as any).image_uri || null, 
          (r as any).is_shared_expense || 0, 
          (r as any).original_receipt_data || null
        ]
      );
    }

    // 3. Restore items
    for (const i of receiptItems) {
      await db.runAsync(
        `INSERT INTO receipt_items (id, receipt_id, name, price, quantity, category, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [i.id, i.receipt_id, i.name, i.price, i.quantity, i.category, i.line_total || 0]
      );
    }

    // 4. Restore budgets
    for (const b of budgets) {
      await db.runAsync(
        'INSERT INTO budgets (category, monthly_limit) VALUES (?, ?)',
        [b.category, b.monthly_limit]
      );
    }

    // 5. Restore merchant preferences
    if (user_version >= 3) {
      for (const m of merchantPreferences) {
        if (!m.merchant_name || !m.category) continue;
        await db.runAsync(
          'INSERT INTO merchant_preferences (merchant_name, category, created_at, updated_at) VALUES (?, ?, ?, ?)',
          [m.merchant_name, m.category, m.created_at || '', m.updated_at || '']
        );
      }
    }
  });
}
