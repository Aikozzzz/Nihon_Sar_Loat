import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { entryKey, type Kind } from "../app/study-data.ts";
import { database, transaction } from "../lib/database.ts";

// Static identifiers only. Order matters because study records refer to accounts and entries.
const tables = [
  ["accounts", ["id", "name", "email", "password", "onboarded"]],
  ["verified_accounts", ["owner"]],
  ["entries", ["id", "owner", "kind", "identity", "term", "reading", "meaning", "rating", "due", "studied"]],
  ["sources", ["entry", "document", "title", "page"]],
  ["reviews", ["id", "entry", "rating", "reviewed", "due"]],
  ["pairs", ["owner", "first", "second"]],
  ["passages", ["id", "owner", "data", "created", "saved"]],
  ["imports", ["id", "owner", "name", "document", "pdf", "created", "expires", "confirmed", "count", "layout"]],
  ["import_pages", ["job", "page", "status", "ocr", "error", "candidates", "lease", "until", "attempts"]],
] as const;

async function transfer() {
  const file = resolve(process.argv[2] || ".nihon-data/study.sqlite");
  const from = new DatabaseSync(file, { readOnly: true });
  try {
    from.exec("BEGIN");
    const counts = await transaction(async (db) => {
      await db.query("LOCK TABLE nihon_private.accounts IN SHARE ROW EXCLUSIVE MODE");
      if ((await db.query("SELECT 1 FROM nihon_private.accounts LIMIT 1")).rowCount) {
        throw new Error("The PostgreSQL destination already contains accounts. Use an empty study schema.");
      }

      const now = Date.now();
      const imported: Record<string, number> = {};
      for (const [table, columns] of tables) {
        const exists = from.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
        if (!exists && table === "verified_accounts") continue;
        const predicate = table === "imports" ? " WHERE confirmed IS NOT NULL OR expires>?"
          : table === "import_pages" ? " WHERE job IN (SELECT id FROM imports WHERE confirmed IS NULL AND expires>?)"
          : table === "passages" ? " WHERE saved=1 OR created>?" : "";
        const values: number[] = predicate ? [table === "passages" ? now - 86_400_000 : now] : [];
        const params = columns.map((_, index) => `$${index + 1}`).join(",");
        const sql = `INSERT INTO nihon_private.${table} (${columns.join(",")}) VALUES (${params})`;
        let count = 0;
        for (const row of from.prepare(`SELECT * FROM ${table}${predicate}`).iterate(...values)) {
          if (table === "entries") {
            // Rebuild the identity from its components. SQLite's text reader can truncate at NUL.
            row.identity = Buffer.from(entryKey({ kind: row.kind as Kind, term: String(row.term), reading: String(row.reading) }));
          }
          if (table === "imports") row.layout ??= "auto";
          if (table === "import_pages") {
            if (row.status === "processing") row.status = "queued";
            row.lease = null;
            row.until = null;
          }
          await db.query(sql, columns.map((column) => row[column]));
          count++;
        }
        imported[table] = count;
      }
      return imported;
    });
    for (const [name, count] of Object.entries(counts)) console.log(`${name}: ${count}`);
  } finally {
    from.close();
  }
}

try {
  await transfer();
  console.log("SQLite transfer complete.");
} catch (error) {
  const alreadyPopulated = error instanceof Error && error.message.startsWith("The PostgreSQL destination");
  console.error(alreadyPopulated ? error.message :
    "SQLite transfer failed. Check the source file, DATABASE_URL, and applied Supabase schema. No rows from this run were committed.");
  process.exitCode = 1;
} finally {
  try { await database().end(); } catch { /* The pool may not have opened. */ }
}
