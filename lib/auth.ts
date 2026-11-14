import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { AppError, database, lockAccount, transaction } from "./database.ts";
import { isLoopback } from "./http.ts";

const cookieName = "nihon_session";
const sessionLife = 30 * 86_400_000;
export type Account = { id: string; name: string; email: string; onboarded: number };
type Purpose = "verify" | "reset";

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function returnTo(value: unknown) {
  return typeof value === "string" && /^\/study(?:\?view=(?:home|library|review|reading|imports))?$/.test(value) ? value : "/study";
}

export async function account(): Promise<Account | undefined> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  const { rows: [user] } = await database().query<Account>(`
    SELECT a.id, a.name, a.email, a.onboarded FROM nihon_private.accounts a
    JOIN nihon_private.sessions s ON s.owner = a.id JOIN nihon_private.verified_accounts v ON v.owner = a.id
    WHERE s.token=$1 AND s.expires>$2
  `, [hashToken(token), Date.now()]);
  return user;
}

async function startSession(id: string, expectedPassword?: string) {
  const token = randomBytes(32).toString("hex");
  const jar = await cookies();
  const old = jar.get(cookieName)?.value;
  await transaction(async (db) => {
    await lockAccount(db, id);
    if (expectedPassword) {
      const { rows: [user] } = await db.query("SELECT password FROM nihon_private.accounts WHERE id=$1", [id]);
      if (user?.password !== expectedPassword) throw new AppError("The email or password is incorrect.", 401);
    }
    if (old) await db.query("DELETE FROM nihon_private.sessions WHERE token=$1", [hashToken(old)]);
    await db.query("INSERT INTO nihon_private.sessions(token, owner, expires) VALUES ($1,$2,$3)", [hashToken(token), id, Date.now() + sessionLife]);
  });
  jar.set(cookieName, token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: sessionLife / 1000,
    secure: process.env.NIHON_SECURE_COOKIES === "1" || (process.env.VERCEL === "1" && process.env.VERCEL_ENV !== "development") || process.env.NIHON_ORIGIN?.trim().startsWith("https://"),
  });
}

function throttle(scope: string, email: string, client: string) {
  const now = Date.now();
  return transaction(async (db) => {
    for (const [key, max] of [[`email:${email}`, scope === "email" ? 4 : 10], [`client:${client}`, client === "all" ? 120 : 30]] as const) {
      const result = await db.query(`INSERT INTO nihon_private.auth_attempts AS a VALUES ($1, 1, $2)
        ON CONFLICT(client) DO UPDATE SET count=CASE WHEN a.expires<=$3 THEN 1 ELSE a.count+1 END,
          expires=CASE WHEN a.expires<=$3 THEN excluded.expires ELSE a.expires END
        WHERE a.expires<=$3 OR a.count<$4`, [hashToken(`${scope}:${key}`), now + 15 * 60_000, now, max]);
      if (!result.rowCount) throw new AppError("Too many attempts. Try again in 15 minutes.", 429);
    }
  });
}

function emailAddress(input: unknown) {
  const email = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || email.includes("\0")) throw new AppError("Enter a valid email address.");
  return email;
}

function strongPassword(input: unknown) {
  if (typeof input !== "string" || input.length < 12 || input.length > 128) throw new AppError("Use 12 to 128 characters for your password.");
  return input;
}

function emailDelivery(origin: string | undefined) {
  if (!origin) throw new AppError("Email delivery is unavailable. Try again in a moment.", 503);
  const local = process.env.NODE_ENV === "development" && process.env.NIHON_DEV_EMAIL_LINKS === "1" && isLoopback(new URL(origin));
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.NIHON_EMAIL_FROM;
  if (!local && (!apiKey || !sender)) throw new AppError("Email delivery is unavailable. Try again in a moment.", 503);
  return { origin, local, apiKey, sender };
}

async function sendLink(id: string, email: string, purpose: Purpose, delivery: ReturnType<typeof emailDelivery>, next: string) {
  const db = database();
  const token = randomBytes(32).toString("hex");
  const hash = hashToken(token);
  const life = purpose === "verify" ? 24 * 60 : 30;
  await db.query("INSERT INTO nihon_private.email_tokens(token,owner,purpose,expires,return_to) VALUES ($1,$2,$3,$4,$5)",
    [hash, id, purpose, Date.now() + life * 60_000, next]);
  const link = new URL(purpose === "verify" ? "/verify-email" : "/reset-password", delivery.origin);
  link.hash = token;
  if (delivery.local) return link.href;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${delivery.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: delivery.sender, to: [email],
        subject: purpose === "verify" ? "Verify your Nihon Sar Loat email" : "Reset your Nihon Sar Loat password",
        text: `${purpose === "verify" ? "Verify your email" : "Reset your password"} using this link: ${link.href}\n\nThe link expires in ${life === 30 ? "30 minutes" : "24 hours"}. If you did not request it, you can ignore this email.`,
      }),
    });
    if (!response.ok) throw new Error("Email provider failure");
    return undefined;
  } catch {
    await db.query("DELETE FROM nihon_private.email_tokens WHERE token=$1", [hash]);
    throw new AppError("Email delivery is unavailable. Try again in a moment.", 503);
  }
}

export async function authenticate(body: Record<string, unknown>, signup: boolean, client: string, origin: string | undefined) {
  const email = emailAddress(body.email);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = signup ? strongPassword(body.password) : body.password;
  if (typeof password !== "string" || !password || password.length > 128) throw new AppError("Enter your password.");
  if (signup && (!name || name.length > 60 || name.includes("\0"))) throw new AppError("Enter your name using up to 60 characters.");
  await throttle(signup ? "email" : "login", email, client);
  const db = database();
  const { rows: [previous] } = await db.query<{ id: string; password: string; onboarded: number; verified: string | null }>(
    `SELECT a.id, a.password, a.onboarded, v.owner AS verified FROM nihon_private.accounts a
      LEFT JOIN nihon_private.verified_accounts v ON v.owner=a.id WHERE a.email=$1`, [email]);
  const [salt, digest] = previous?.password.split(":") ?? [randomBytes(16).toString("hex"), ""];
  const computed = await derive(password, salt);
  const next = returnTo(body.next);
  if (signup) {
    if (previous) throw new AppError("This email already has an account. Log in or resend your verification link.", 409);
    const delivery = emailDelivery(origin);
    const id = randomUUID();
    const inserted = await db.query("INSERT INTO nihon_private.accounts(id,name,email,password) VALUES ($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING",
      [id, name, email, `${salt}:${computed.toString("hex")}`]);
    if (!inserted.rowCount) throw new AppError("This email already has an account. Log in or resend your verification link.", 409);
    const link = await sendLink(id, email, "verify", delivery, next);
    return { pending: true, link };
  }
  if (!previous || digest.length !== 128 || !timingSafeEqual(computed, Buffer.from(digest, "hex"))) throw new AppError("The email or password is incorrect.", 401);
  if (!previous.verified) return { pending: true };
  await startSession(previous.id, previous.password);
  await db.query("DELETE FROM nihon_private.auth_attempts WHERE client=$1", [hashToken(`login:email:${email}`)]);
  return { next: previous.onboarded ? next : "/onboarding" };
}

export async function requestEmail(body: Record<string, unknown>, purpose: Purpose, client: string, origin: string | undefined) {
  const email = emailAddress(body.email);
  const delivery = emailDelivery(origin);
  await throttle("email", email, client);
  const { rows: [row] } = await database().query<{ id: string; verified: string | null }>(`
    SELECT a.id,v.owner AS verified FROM nihon_private.accounts a
    LEFT JOIN nihon_private.verified_accounts v ON v.owner=a.id WHERE a.email=$1`, [email]);
  const eligible = row && (purpose === "verify" ? !row.verified : row.verified);
  return { link: eligible ? await sendLink(String(row.id), email, purpose, delivery, returnTo(body.next)) : undefined };
}

export async function redeemEmail(body: Record<string, unknown>, purpose: Purpose) {
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AppError("This link is invalid or expired. Request a new one.");
  const hash = hashToken(token);
  const db = database();
  const eligible = "SELECT owner FROM nihon_private.email_tokens WHERE token=$1 AND purpose=$2 AND expires>$3";
  const { rows: [pending] } = await db.query<{ owner: string }>(eligible, [hash, purpose, Date.now()]);
  if (!pending) throw new AppError("This link is invalid or expired. Request a new one.");
  const salt = randomBytes(16).toString("hex");
  const computed = purpose === "reset" ? await derive(strongPassword(body.password), salt) : null;
  const owner = await transaction(async (db) => {
    await lockAccount(db, pending.owner);
    const consumed = await db.query(`
      DELETE FROM nihon_private.email_tokens WHERE token=$1 AND purpose=$2 AND expires>$3 AND owner=$4
    `, [hash, purpose, Date.now(), pending.owner]);
    if (!consumed.rowCount) throw new AppError("This link is invalid or expired. Request a new one.");
    const id = pending.owner;
    await db.query("DELETE FROM nihon_private.email_tokens WHERE owner=$1 AND purpose=$2", [id, purpose]);
    if (computed) {
      await db.query("UPDATE nihon_private.accounts SET password=$1 WHERE id=$2", [`${salt}:${computed.toString("hex")}`, id]);
      await db.query("DELETE FROM nihon_private.sessions WHERE owner=$1", [id]);
    } else await db.query("INSERT INTO nihon_private.verified_accounts(owner) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
    return id;
  });
  if (purpose === "verify") await startSession(owner);
  return { next: purpose === "verify" ? "/onboarding" : "/log-in?reset=1" };
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await database().query("DELETE FROM nihon_private.sessions WHERE token=$1", [hashToken(token)]);
  jar.delete(cookieName);
}
