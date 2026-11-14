import { AppError } from "./database.ts";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("Expected an object.");
  return value as Record<string, unknown>;
}

export function field(value: unknown, name: string, max: number, optional = false) {
  if (optional && value === undefined) return "";
  if (typeof value !== "string" || value.length > max || value.includes("\0") || (!optional && !value.trim())) {
    throw new AppError(`Enter a valid ${name}.`);
  }
  return value.trim();
}

export function identifier(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError("Invalid identifier.");
  }
  return value.toLowerCase();
}

export async function readBytes(request: Request, limit: number, message = "Request is too large.") {
  if (Number(request.headers.get("content-length")) > limit) throw new AppError(message, 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        void reader.cancel().catch(() => {});
        throw new AppError(message, 413);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, length);
  } finally {
    reader.releaseLock();
  }
}

export async function readJson(request: Request, limit = 32_768) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new AppError("Send JSON.", 415);
  const bytes = await readBytes(request, limit);
  let payload: unknown;
  try { payload = JSON.parse(bytes.toString("utf8")); }
  catch { throw new AppError("Invalid JSON."); }
  return object(payload);
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const host = request.headers.get("host");
  const url = new URL(request.url);
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const protocol = process.env.VERCEL === "1" && process.env.VERCEL_ENV !== "development" ? "https:"
    : process.env.NIHON_TRUST_PROXY === "1" && (forwardedProtocol === "https" || forwardedProtocol === "http")
      ? `${forwardedProtocol}:` : url.protocol;
  const target = host ? `${protocol}//${host}` : url.origin;
  if (fetchSite === "cross-site" || fetchSite === "same-site" || (origin && origin !== target)) {
    throw new AppError("Open the app directly and try again.", 403);
  }
}

export function accountEmailOrigin() {
  const configured = process.env.NIHON_ORIGIN?.trim();
  if (configured) {
    const url = URL.parse(configured);
    if (!url || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return undefined;
    if (url.protocol === "https:" || (process.env.NODE_ENV === "development" && url.protocol === "http:" && isLoopback(url))) {
      return url.origin;
    }
    return undefined;
  }
  const vercelHost = process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelHost) return `https://${vercelHost}`;
}

export function isLoopback(url: URL) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}
