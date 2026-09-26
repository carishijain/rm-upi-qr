// Thin wrapper around the Pages Functions API backed by D1.

async function request(path, options) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export function createTransaction({ amount, upi_id, bank_label }) {
  return request("/api/transactions", {
    method: "POST",
    body: JSON.stringify({ amount, upi_id, bank_label }),
  }).then((d) => d.transaction);
}

export function fetchDates() {
  return request("/api/dates").then((d) => d.dates);
}

export function fetchTransactionsRange(from, to) {
  const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  return request(`/api/transactions?${q}`).then((d) => d.transactions);
}

export function fetchSummary(from, to) {
  const q = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  return request(`/api/summary?${q}`).then((d) => d.summary);
}

export function fetchMonths() {
  return request("/api/months").then((d) => d.months);
}

export function updateTransactionStatus(id, status) {
  return request(`/api/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }).then((d) => d.transaction);
}

export function deleteTransaction(id) {
  return request(`/api/transactions/${id}`, { method: "DELETE" }).then((d) => d.deleted);
}
