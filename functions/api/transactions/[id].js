import { json, badRequest, notFound, VALID_STATUSES, CATEGORY_CASE_SQL } from "../_utils.js";

// PATCH /api/transactions/:id   { status: "done" | "ignore" | "pending" }
export async function onRequestPatch({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return badRequest("Invalid transaction id.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be JSON.");
  }

  const status = String(body.status || "");
  if (!VALID_STATUSES.includes(status)) {
    return badRequest(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  const updated = await env.DB.prepare(
    `UPDATE transactions SET status = ? WHERE id = ?
     RETURNING id, amount, ${CATEGORY_CASE_SQL} AS category, status, created_at, txn_date, txn_time`
  )
    .bind(status, id)
    .first();

  if (!updated) return notFound("Transaction not found.");
  return json({ transaction: updated });
}

// DELETE /api/transactions/:id — permanently removes the row.
export async function onRequestDelete({ env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return badRequest("Invalid transaction id.");

  const deleted = await env.DB.prepare(`DELETE FROM transactions WHERE id = ? RETURNING id`)
    .bind(id)
    .first();

  if (!deleted) return notFound("Transaction not found.");
  return json({ deleted: true, id: deleted.id });
}

// GET /api/transactions/:id — occasionally handy, not used by the UI directly.
export async function onRequestGet({ env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return badRequest("Invalid transaction id.");

  const row = await env.DB.prepare(
    `SELECT id, amount, ${CATEGORY_CASE_SQL} AS category, status, created_at, txn_date, txn_time
     FROM transactions WHERE id = ?`
  )
    .bind(id)
    .first();

  if (!row) return notFound("Transaction not found.");
  return json({ transaction: row });
}
