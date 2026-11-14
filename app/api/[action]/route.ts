import { account, authenticate, redeemEmail, requestEmail, signOut } from "../../../lib/auth";
import { AppError, database } from "../../../lib/database";
import { checkOrigin, identifier, readJson } from "../../../lib/http";
import { cancelImport, confirmImport, importFor, importsFor, queueImport, retryImport } from "../../../lib/imports";
import { entriesFor, pairsFor, passagesFor, rateEntry, removeEntry, saveEntry, savePair } from "../../../lib/library";
import { generateReading } from "../../../lib/reading";
import { studyState } from "../../../lib/study-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ action: string }> };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

function errorResponse(error: unknown) {
  if (error instanceof AppError) return json({ error: error.message }, error.status);
  console.error("A study request failed.");
  return json({ error: "Something went wrong. Please try again." }, 500);
}

async function signedIn() {
  const user = await account();
  if (!user) throw new AppError("Log in to continue.", 401);
  return user;
}

export async function GET(request: Request, context: Context) {
  try {
    const { action } = await context.params;
    const user = await signedIn();
    if (action === "imports") {
      const id = new URL(request.url).searchParams.get("id");
      return json(await (id ? importFor(user.id, identifier(id)) : importsFor(user.id)));
    }
    if (action === "workspace") return json(await studyState(user.id));
    return json({ error: "Page unavailable." }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { action } = await context.params;
    if (["signup", "login", "resend", "forgot", "verify", "reset"].includes(action)) {
      const body = await readJson(request);
      const origin = process.env.NIHON_ORIGIN || request.headers.get("origin") || new URL(request.url).origin;
      const client = process.env.NIHON_TRUST_PROXY === "1" ? request.headers.get("x-real-ip") || "all" : "all";
      if (action === "signup" || action === "login") return json(await authenticate(body, action === "signup", client, origin));
      if (action === "verify" || action === "reset") return json(await redeemEmail(body, action));
      return json(await requestEmail(body, action === "resend" ? "verify" : "reset", client, origin));
    }
    if (action === "logout") {
      await signOut();
      return json({});
    }
    const { id: owner } = await signedIn();
    if (action === "onboard") {
      await database().query("UPDATE nihon_private.accounts SET onboarded=1 WHERE id=$1", [owner]);
      return json({});
    }
    if (action === "upload") return json(await queueImport(owner, request), 202);
    const body = await readJson(request, action === "confirm-import" ? 4 * 1024 * 1024 : undefined);
    const db = database();
    switch (action) {
      case "entry":
        await saveEntry(owner, body.entry, body.edit === true);
        return json(await entriesFor(owner));
      case "remove-entry": {
        await removeEntry(owner, identifier(body.id));
        const [entries, pairs] = await Promise.all([entriesFor(owner), pairsFor(owner)]);
        return json({ entries, pairs });
      }
      case "rate":
        await rateEntry(owner, identifier(body.id), body.rating, identifier(body.event));
        return json(await entriesFor(owner));
      case "pair":
        await savePair(owner, identifier(body.first), identifier(body.second));
        return json(await pairsFor(owner));
      case "retry-import":
        return json(await retryImport(owner, identifier(body.id)));
      case "cancel-import":
        await cancelImport(owner, identifier(body.id));
        return json(await importsFor(owner));
      case "confirm-import": {
        const job = await confirmImport(owner, identifier(body.id), body.selection);
        return json({ job, state: await studyState(owner) });
      }
      case "reading":
        return json(await generateReading(owner, body));
      case "save-reading": {
        if (typeof body.saved !== "boolean") throw new AppError("Choose whether to save this passage.");
        const result = await db.query("UPDATE nihon_private.passages SET saved=$1 WHERE owner=$2 AND id=$3", [Number(body.saved), owner, identifier(body.id)]);
        if (!result.rowCount) throw new AppError("This passage is unavailable. Generate another passage.", 404);
        return json(await passagesFor(owner));
      }
      default:
        return json({ error: "Page unavailable." }, 404);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
