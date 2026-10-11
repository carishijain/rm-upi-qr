// Shared helpers for the /api/* Pages Functions.
// Files/folders prefixed with "_" are not routable — Pages just lets us import them.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function badRequest(message) {
  return json({ error: message }, 400);
}

export function notFound(message = "Not found") {
  return json({ error: message }, 404);
}

// India doesn't observe DST, so this offset is fixed — no timezone DB needed.
const IST_OFFSET_MINUTES = 5 * 60 + 30;

// Returns { date: "YYYY-MM-DD", time: "HH:MM", iso: "<UTC ISO string>" } for "now",
// with date/time expressed in India Standard Time regardless of where the
// Worker happens to execute.
export function nowIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MINUTES * 60000);
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
  const time = `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
  return { date, time, iso: now.toISOString() };
}

export const VALID_STATUSES = ["pending", "done", "ignore"];

// ---------- History password lock ----------
//
// Every timestamp compared here is produced by this Worker's own `new
// Date()` — never a value the browser sends. That's what makes the lockout
// immune to someone changing their phone's clock: the phone's idea of "now"
// is never consulted when deciding whether an attempt is allowed.

export const SESSION_COOKIE = "rm_session";
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const LOCKOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_ATTEMPTS = 3;

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return out;
}

export function sessionCookieHeader(token, request) {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  // Secure cookies are silently dropped by browsers over plain HTTP, which
  // would break `wrangler pages dev` (http://localhost). Production
  // (Cloudflare Pages) is always HTTPS, so this only ever omits Secure
  // during local development.
  const secure = request && request.url.startsWith("https://") ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly${secure}; SameSite=Lax`;
}

export const CLEAR_SESSION_COOKIE_HEADER = `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

// True if this request carries a still-valid session cookie. Expired rows
// are simply treated as "no session" — they don't need to be deleted for
// this check to be correct, since expires_at is re-checked every time.
export async function hasValidSession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return false;
  const row = await env.DB.prepare("SELECT expires_at FROM sessions WHERE token = ?").bind(token).first();
  if (!row) return false;
  return new Date(row.expires_at).getTime() > Date.now();
}

export function unauthorized() {
  return json({ error: "Locked. Enter the History password." }, 401);
}

// The bank_label column stores exactly "below_2000" or "at_or_above_2000" —
// set by the browser at creation time (see public/js/payees.js) — never a
// real bank or account name. So exposing it as "category" needs no mapping.
export const CATEGORY_CASE_SQL = `bank_label`;

// Reusable SUM(...) fragments for aggregate endpoints (dates.js, summary.js,
// months.js). Both bucket sums count "done" transactions only, matching what
// the UI calls "received".
export const CATEGORY_SUMS_SQL = `
  SUM(CASE WHEN status = 'done' AND bank_label = 'below_2000' THEN amount ELSE 0 END) AS below_2000_done,
  SUM(CASE WHEN status = 'done' AND bank_label = 'at_or_above_2000' THEN amount ELSE 0 END) AS at_or_above_2000_done
`;
