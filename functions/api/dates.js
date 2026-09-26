import { json, CATEGORY_SUMS_SQL } from "./_utils.js";

// GET /api/dates
// Every day that has at least one transaction, newest first, with the
// "Done" grand total, the below/above-₹2,000 breakdown, and status counts
// needed for the history page.
export async function onRequestGet({ env }) {
  const result = await env.DB.prepare(
    `SELECT
       txn_date,
       SUM(CASE WHEN status = 'done'   THEN amount ELSE 0 END) AS total_done,
       ${CATEGORY_SUMS_SQL},
       SUM(CASE WHEN status = 'done'    THEN 1 ELSE 0 END)     AS count_done,
       SUM(CASE WHEN status = 'ignore'  THEN 1 ELSE 0 END)     AS count_ignore,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)     AS count_pending,
       COUNT(*)                                                AS count_total
     FROM transactions
     GROUP BY txn_date
     ORDER BY txn_date DESC`
  ).all();

  return json({ dates: result.results ?? [] });
}
