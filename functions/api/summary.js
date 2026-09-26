import { json, badRequest, CATEGORY_SUMS_SQL } from "./_utils.js";

// GET /api/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// One combined total plus the below/above-₹2,000 breakdown for any date
// range (inclusive, IST calendar dates). Powers the History page's Range tab.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return badRequest("from and to are both required (YYYY-MM-DD).");
  }

  const row = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN status = 'done' THEN amount ELSE 0 END) AS total_done,
       ${CATEGORY_SUMS_SQL},
       SUM(CASE WHEN status = 'done'    THEN 1 ELSE 0 END) AS count_done,
       SUM(CASE WHEN status = 'ignore'  THEN 1 ELSE 0 END) AS count_ignore,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS count_pending,
       COUNT(*)                                             AS count_total
     FROM transactions
     WHERE txn_date BETWEEN ? AND ?`
  )
    .bind(from, to)
    .first();

  return json({ from, to, summary: row });
}
