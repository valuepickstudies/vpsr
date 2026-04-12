import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function checkDb() {
  const db = await open({
    filename: './announcements.db',
    driver: sqlite3.Database
  });

  const count = await db.get("SELECT COUNT(*) as count FROM announcements");
  console.log("Total announcements:", count.count);

  const categories = await db.all("SELECT category, COUNT(*) as count FROM announcements GROUP BY category");
  console.log("Categories:", categories);

  const results = await db.all("SELECT * FROM announcements WHERE category = 'Result' LIMIT 5");
  console.log("Results sample:", results);
}

checkDb();
