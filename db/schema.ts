import * as SQLite from 'expo-sqlite';

let isInitialized = false;

export async function initDatabase(db: SQLite.SQLiteDatabase) {
  if (isInitialized) return;

  await db.execAsync(`PRAGMA foreign_keys = ON;`);

  const { user_version } = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version') || { user_version: 0 };
  let currentVersion = user_version;

  if (currentVersion === 0) {
    const tableCheck = await db.getFirstAsync<{ count: number }>(
      "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='receipts';"
    );

    if (tableCheck && tableCheck.count > 0) {
      // Legacy database exists without user_version. Apply safe bridging to V1.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS receipts (
          id TEXT PRIMARY KEY, merchant_name TEXT, total_amount REAL NOT NULL, purchase_date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS receipt_items (
          id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL, name TEXT NOT NULL, price REAL NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1, category TEXT NOT NULL DEFAULT '',
          FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS budgets (category TEXT PRIMARY KEY, monthly_limit REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON receipt_items(receipt_id);
        CREATE INDEX IF NOT EXISTS idx_receipts_purchase_date ON receipts(purchase_date DESC);
        CREATE INDEX IF NOT EXISTS idx_receipt_items_category ON receipt_items(category);
      `);
      
      await addColumnIfMissing(db, 'receipts', 'merchant_name', 'TEXT');
      await addColumnIfMissing(db, 'receipts', 'created_at', "TEXT NOT NULL DEFAULT ''");
      await addColumnIfMissing(db, 'receipts', 'updated_at', "TEXT NOT NULL DEFAULT ''");
      await addColumnIfMissing(db, 'receipts', 'tax', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfMissing(db, 'receipts', 'service_charge', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfMissing(db, 'receipts', 'source_type', "TEXT NOT NULL DEFAULT 'receipt'");
      await addColumnIfMissing(db, 'receipts', 'discount', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfMissing(db, 'receipt_items', 'line_total', 'REAL NOT NULL DEFAULT 0');

      await db.execAsync(`
        UPDATE receipts SET created_at = COALESCE(NULLIF(created_at, ''), NULLIF(updated_at, ''), datetime('now')) WHERE created_at IS NULL OR created_at = '';
        UPDATE receipts SET updated_at = COALESCE(NULLIF(updated_at, ''), NULLIF(created_at, ''), datetime('now')) WHERE updated_at IS NULL OR updated_at = '';
        UPDATE receipt_items SET line_total = ROUND(price * quantity) WHERE line_total = 0 AND price > 0;
        CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_receipts_updated_at ON receipts(updated_at DESC);
      `);
    } else {
      // Fresh install V1 baseline
      await db.execAsync(`
        CREATE TABLE receipts (
          id TEXT PRIMARY KEY, merchant_name TEXT, total_amount REAL NOT NULL, purchase_date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '', tax REAL NOT NULL DEFAULT 0,
          service_charge REAL NOT NULL DEFAULT 0, source_type TEXT NOT NULL DEFAULT 'receipt', discount REAL NOT NULL DEFAULT 0
        );
        CREATE TABLE receipt_items (
          id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL, name TEXT NOT NULL, price REAL NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1, category TEXT NOT NULL DEFAULT '', line_total REAL NOT NULL DEFAULT 0,
          FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
        );
        CREATE TABLE budgets (category TEXT PRIMARY KEY, monthly_limit REAL NOT NULL);
        CREATE INDEX idx_receipt_items_receipt_id ON receipt_items(receipt_id);
        CREATE INDEX idx_receipts_purchase_date ON receipts(purchase_date DESC);
        CREATE INDEX idx_receipt_items_category ON receipt_items(category);
        CREATE INDEX idx_receipts_created_at ON receipts(created_at DESC);
        CREATE INDEX idx_receipts_updated_at ON receipts(updated_at DESC);
        
        CREATE TABLE merchant_preferences (
          merchant_name TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT ''
        );
      `);
    }

    currentVersion = 1;
    await db.execAsync(`PRAGMA user_version = 1;`);
  }

  if (currentVersion === 1) {
    await db.execAsync(`ALTER TABLE receipts ADD COLUMN image_uri TEXT;`);
    currentVersion = 2;
    await db.execAsync(`PRAGMA user_version = 2;`);
  }

  if (currentVersion === 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS merchant_preferences (
        merchant_name TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT ''
      );
    `);
    currentVersion = 3;
    await db.execAsync(`PRAGMA user_version = 3;`);
  }

  if (currentVersion === 3) {
    await db.execAsync(`
      ALTER TABLE receipts ADD COLUMN is_shared_expense INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE receipts ADD COLUMN original_receipt_data TEXT;
    `);
    currentVersion = 4;
    await db.execAsync(`PRAGMA user_version = 4;`);
  }

  isInitialized = true;
}

async function addColumnIfMissing(db: SQLite.SQLiteDatabase, table: string, column: string, definition: string) {
  try { await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`); } catch {}
}
