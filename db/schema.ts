import * as SQLite from 'expo-sqlite';

export async function initDatabase(db: SQLite.SQLiteDatabase) {
  console.log('[DB] initDatabase START');
  try {
    await db.execAsync(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY,
        merchant_name TEXT,
        total_amount REAL NOT NULL,
        purchase_date TEXT NOT NULL,
        created_at TEXT NOT NULL
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
    `);

    try {
      await db.execAsync(`ALTER TABLE receipts ADD COLUMN merchant_name TEXT;`);
    } catch {
      // column already exists — ignore
    }

    try {
      await db.execAsync(`ALTER TABLE receipts ADD COLUMN tax REAL NOT NULL DEFAULT 0;`);
    } catch {
      // column already exists — ignore
    }

    try {
      await db.execAsync(`ALTER TABLE receipts ADD COLUMN service_charge REAL NOT NULL DEFAULT 0;`);
    } catch {
      // column already exists — ignore
    }

    try {
      await db.execAsync(`ALTER TABLE receipts ADD COLUMN source_type TEXT NOT NULL DEFAULT 'receipt';`);
    } catch {
      // column already exists — ignore
    }
    console.log('[DB] initDatabase COMPLETE');
  } catch (e) {
    console.log('[DB] initDatabase ERROR:', e);
    throw e;
  }
}
