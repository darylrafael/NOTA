import * as SQLite from 'expo-sqlite';

export async function initDatabase(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      merchant_name TEXT,
      total_amount REAL NOT NULL,
      purchase_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS receipt_items (
      id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      category TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budgets (
      category TEXT PRIMARY KEY,
      monthly_limit REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id
      ON receipt_items(receipt_id);

    CREATE INDEX IF NOT EXISTS idx_receipts_purchase_date
      ON receipts(purchase_date DESC);

    CREATE INDEX IF NOT EXISTS idx_receipt_items_category
      ON receipt_items(category);
  `);

  await addColumnIfMissing(db, 'receipts', 'merchant_name', 'TEXT');
  await addColumnIfMissing(db, 'receipts', 'updated_at', 'TEXT');
  await addColumnIfMissing(db, 'receipts', 'tax', 'REAL NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'receipts', 'service_charge', 'REAL NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'receipts', 'source_type', "TEXT NOT NULL DEFAULT 'receipt'");
  await addColumnIfMissing(db, 'receipts', 'discount', 'REAL NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'receipt_items', 'line_total', 'REAL NOT NULL DEFAULT 0');

  await db.execAsync(`
    UPDATE receipts
    SET updated_at = created_at
    WHERE updated_at IS NULL;

    UPDATE receipt_items
    SET line_total = ROUND(price * quantity)
    WHERE line_total = 0 AND price > 0;

    CREATE INDEX IF NOT EXISTS idx_receipts_updated_at
      ON receipts(updated_at DESC);
  `);
}

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string
) {
  try {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  } catch {
    // column already exists
  }
}
