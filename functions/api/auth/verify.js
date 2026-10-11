import { json, badRequest, sha256Hex, sessionCookieHeader, SESSION_TTL_MS, LOCKOUT_MS, MAX_ATTEMPTS } from "../_utils.js";

// POST /api/auth/verify  { password: string }
//
// Every decision here is based on this Worker's own clock, read fresh each
// call — never a timestamp supplied by the browser. Changing a phone's
// system clock has no effect on anything in this file.
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be JSON.");
  }

  const password = String(body.password || "");
  if (!password) return badRequest("password is required.");

  const row = await env.DB.prepare(
    "SELECT password_hash, failed_attempts, locked_until FROM auth_state WHERE id = 1"
  ).first();
  if (!row) return json({ error: "Auth is not set up — run schema.sql against this database." }, 500);

  const now = Date.now();
  const stillLocked = row.locked_until && new Date(row.locked_until).getTime() > now;

  if (stillLocked) {
    return json({ success: false, locked: true, lockedUntil: row.locked_until }, 423);
  }

  // A previous lockout has expired (or there wasn't one) — this attempt
  // starts from a clean slate either way.
  const startingAttempts = row.locked_until ? 0 : row.failed_attempts;

  const suppliedHash = await sha256Hex(password);
  if (suppliedHash === row.password_hash) {
    await env.DB.prepare("UPDATE auth_state SET failed_attempts = 0, locked_until = NULL WHERE id = 1").run();

    const token = crypto.randomUUID();
    const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
    await env.DB.prepare("INSERT INTO sessions (token, expires_at) VALUES (?, ?)").bind(token, expiresAt).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "Set-Cookie": sessionCookieHeader(token, request),
      },
    });
  }

  const failedAttempts = startingAttempts + 1;
  const nowLocked = failedAttempts >= MAX_ATTEMPTS;
  const lockedUntil = nowLocked ? new Date(now + LOCKOUT_MS).toISOString() : null;

  await env.DB.prepare("UPDATE auth_state SET failed_attempts = ?, locked_until = ? WHERE id = 1")
    .bind(nowLocked ? 0 : failedAttempts, lockedUntil)
    .run();

  return json(
    {
      success: false,
      locked: nowLocked,
      lockedUntil,
      attemptsRemaining: nowLocked ? 0 : MAX_ATTEMPTS - failedAttempts,
    },
    nowLocked ? 423 : 401
  );
}
