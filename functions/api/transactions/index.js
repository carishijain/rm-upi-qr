import { json, badRequest, nowIST, CATEGORY_CASE_SQL } from "../_utils.js";

// GET /api/transactions                          -> most recent 100, newest first
// GET /api/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD -> all in that inclusive
//     IST date range, oldest first (from == to for a single day)
//
// Note: this deliberately never selects upi_id or bank_label — the browser
// only ever learns which of the two anonymous "category" buckets a payment
// fell into, never the actual account it went to.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if ((from && !to) || (!from && to)) {
    return badRequest("from and to must be provided together.");
  }

  let result;
  if (from && to) {
    result = await env.DB.prepare(
      `SELECT id, amount, ${CATEGORY_CASE_SQL} AS category, status, created_at, txn_date, txn_time
       FROM transactions WHERE txn_date BETWEEN ? AND ? ORDER BY created_at ASC`
    )
      .bind(from, to)
      .all();
  } else {
    result = await env.DB.prepare(
      `SELECT id, amount, ${CATEGORY_CASE_SQL} AS category, status, created_at, txn_date, txn_time
       FROM transactions ORDER BY created_at DESC LIMIT 100`
    ).all();
  }

  return json({ transactions: result.results ?? [] });
}

// POST /api/transactions  { amount: number, upi_id: string, bank_label: string }
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be JSON.");
  }

  const amount = Number(body.amount);
  const upiId = String(body.upi_id || "").trim();
  const bankLabel = String(body.bank_label || "").trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return badRequest("amount must be a positive number.");
  }
  if (!upiId) {
    return badRequest("upi_id is required.");
  }
  if (!bankLabel) {
    return badRequest("bank_label is required.");
  }

  const { date, time, iso } = nowIST();

  const inserted = await env.DB.prepare(
    `INSERT INTO transactions (amount, upi_id, bank_label, status, created_at, txn_date, txn_time)
     VALUES (?, ?, ?, 'pending', ?, ?, ?)
     RETURNING id, amount, upi_id, bank_label, status, created_at, txn_date, txn_time`
  )
    .bind(amount, upiId, bankLabel, iso, date, time)
    .first();

  return json({ transaction: inserted }, 201);
}
