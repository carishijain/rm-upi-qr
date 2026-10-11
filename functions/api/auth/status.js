import { json, hasValidSession } from "../_utils.js";

// GET /api/auth/status
// Lets the History page decide, on load, whether to show its content
// straight away (valid session), the password form, or a lockout countdown —
// and lets the countdown re-sync itself against the server periodically.
export async function onRequestGet({ request, env }) {
  if (await hasValidSession(request, env)) {
    return json({ authenticated: true });
  }

  const row = await env.DB.prepare("SELECT locked_until FROM auth_state WHERE id = 1").first();
  const now = Date.now();
  const lockedUntilMs = row && row.locked_until ? new Date(row.locked_until).getTime() : 0;

  if (lockedUntilMs > now) {
    return json({
      authenticated: false,
      locked: true,
      lockedUntil: row.locked_until,
      secondsRemaining: Math.ceil((lockedUntilMs - now) / 1000),
    });
  }

  return json({ authenticated: false, locked: false });
}
