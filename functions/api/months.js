import { json, CATEGORY_SUMS_SQL } from "./_utils.js";

// GET /api/months
// One row per calendar month that has at least one transaction, newest
// first, with the total received and the below/above-₹2,000 breakdown.
export async function onRequestGet({ env }) {
  const result = await env.DB.prepare(
    `SELECT
       substr(txn_date, 1, 7) AS month,
       SUM(CASE WHEN status = 'done' THEN amount ELSE 0 END) AS total_done,
       ${CATEGORY_SUMS_SQL},
       SUM(CASE WHEN status = 'done'    THEN 1 ELSE 0 END) AS count_done,
       SUM(CASE WHEN status = 'ignore'  THEN 1 ELSE 0 END) AS count_ignore,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS count_pending,
       COUNT(*)                                             AS count_total
     FROM transactions
     GROUP BY month
     ORDER BY month DESC`
  ).all();

  return json({ months: result.results ?? [] });
}
