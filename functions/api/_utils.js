// Shared helpers for the /api/* Pages Functions.
// Files/folders prefixed with "_" are not routable — Pages just lets us import them.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
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
