import Database from "better-sqlite3";
import { randomInt } from "node:crypto";

const DB_PATH = process.env.SQLITE_PATH ?? "./sample.db";
const db = new Database(DB_PATH);

// Use a transaction + temporarily disable FK checks for schema rebuild
db.exec("PRAGMA foreign_keys = OFF;");
db.exec("BEGIN IMMEDIATE;");

try {
  // IMPORTANT: Drop child first, then parent
  db.exec(`
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS customers;

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      order_date TEXT NOT NULL,
      total_amount REAL NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);

  // Insert customers
  const customers = [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob"   },
    { id: 3, name: "Charlie" }
  ];
  const insertCustomer = db.prepare(
    "INSERT INTO customers (id, name) VALUES (@id, @name)"
  );
  for (const c of customers) insertCustomer.run(c);

  // Insert orders (last 30 days, ~50% fill rate)
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, customer_id, order_date, total_amount)
    VALUES (@id, @customer_id, @order_date, @total_amount)
  `);

  let oid = 1;
  const start = new Date();
  start.setDate(start.getDate() - 30);

  for (let d = 0; d < 30; d++) {
    const date = new Date(start);
    date.setDate(start.getDate() + d);
    const day = date.toISOString().slice(0, 10);

    for (const c of customers) {
      if (Math.random() < 0.5) {
        insertOrder.run({
          id: oid++,
          customer_id: c.id,
          order_date: day,
          total_amount: (randomInt(1000, 20000) / 100).toFixed(2)
        });
      }
    }
  }

  db.exec("COMMIT;");
} catch (err) {
  db.exec("ROLLBACK;");
  throw err;
} finally {
  // Re-enable FK enforcement for normal use
  db.exec("PRAGMA foreign_keys = ON;");
  db.close();
  console.log(`Seeded SQLite at ${DB_PATH}`);
}
