import { readFileSync } from "node:fs";
import pg, { type PoolClient } from "pg";

let pool: pg.Pool | undefined;

export function database() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new AppError("Set DATABASE_URL to connect the study database.", 503);
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new AppError("DATABASE_URL is invalid. Copy the PostgreSQL URI from Supabase → Connect → Session pooler.", 503);
  }
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.hostname) {
    throw new AppError("DATABASE_URL must start with postgresql:// or postgres://. In Supabase, copy the URI from Connect → Session pooler.", 503);
  }
  if (url.password.includes("YOUR-PASSWORD")) {
    throw new AppError("Replace the password placeholder in DATABASE_URL with your URL-encoded database password.", 503);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const sslmode = url.searchParams.get("sslmode");
  // URI SSL options override the driver's TLS configuration if left in the URI.
  for (const option of ["sslmode", "sslcert", "sslkey", "sslrootcert", "ssl", "uselibpqcompat"]) {
    url.searchParams.delete(option);
  }
  const caFile = process.env.NIHON_DATABASE_CA_FILE;
  const ca = process.env.NIHON_DATABASE_CA_PEM?.trim() || (caFile ? readFileSync(caFile, "utf8") : undefined);
  pool = new pg.Pool({
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 5_000,
    ssl: local && (!sslmode || sslmode === "disable") && !ca
      ? false : { rejectUnauthorized: true, ca },
    types: {
      getTypeParser(oid: number, format?: "text" | "binary") {
        // The app stores millisecond timestamps as bigint and exposes them as JS numbers.
        return oid === pg.types.builtins.INT8 && format !== "binary" ? Number : pg.types.getTypeParser(oid, format);
      },
    },
  });
  pool.on("error", () => console.error("A database connection was interrupted."));
  return pool;
}

export async function transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await database().connect();
  let discard = false;
  try {
    await db.query("BEGIN");
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    db.release(discard);
  }
}

export async function lockAccount(db: PoolClient, owner: string) {
  const result = await db.query("SELECT 1 FROM nihon_private.accounts WHERE id=$1 FOR NO KEY UPDATE", [owner]);
  if (!result.rowCount) throw new AppError("Log in to continue.", 401);
}

export async function metric(operation: string, result: string, start: number, tokens = 0) {
  try {
    await database().query("INSERT INTO nihon_private.metrics(operation, result, duration, tokens, created) VALUES ($1,$2,$3,$4,$5)",
      [operation, result, Date.now() - start, tokens, Date.now()]);
  } catch {
    console.error("Could not save an operation metric.");
  }
}

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
