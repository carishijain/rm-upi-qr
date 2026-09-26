import { initTheme } from "./theme.js";
import { formatIndianNumber, categoryLabel } from "./format.js";
import {
  fetchDates,
  fetchTransactionsRange,
  fetchSummary,
  fetchMonths,
  updateTransactionStatus,
  deleteTransaction,
} from "./api.js";

initTheme();

const els = {
  skeleton: document.getElementById("skeleton"),
  emptyState: document.getElementById("empty-state"),
  viewTabs: document.getElementById("view-tabs"),
  tabButtons: Array.from(document.querySelectorAll(".tab-btn")),

  dayView: document.getElementById("day-view"),
  dateRail: document.getElementById("date-rail"),
  daySummary: document.getElementById("day-summary"),
  dayTxnList: document.getElementById("day-txn-list"),

  rangeView: document.getElementById("range-view"),
  presetButtons: Array.from(document.querySelectorAll(".preset-chip")),
  rangeFromInput: document.getElementById("range-from"),
  rangeToInput: document.getElementById("range-to"),
  rangeApplyBtn: document.getElementById("range-apply"),
  rangeSummary: document.getElementById("range-summary"),
  rangeTxnList: document.getElementById("range-txn-list"),

  monthView: document.getElementById("month-view"),
  monthList: document.getElementById("month-list"),

  toast: document.getElementById("toast"),
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ---------- date helpers (all plain string/UTC-component math — never lets
// the browser's own local timezone shift a calendar date) ----------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60000);
  return `${ist.getUTCFullYear()}-${pad2(ist.getUTCMonth() + 1)}-${pad2(ist.getUTCDate())}`;
}

function dateParts(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const jsDate = new Date(Date.UTC(y, m - 1, d));
  return { weekday: WEEKDAYS[jsDate.getUTCDay()], day: d, month: MONTHS[m - 1] };
}

function chipLabel(dateStr) {
  if (dateStr === todayIST()) return "Today";
  const { weekday, day, month } = dateParts(dateStr);
  return `${weekday} ${day} ${month}`;
}

function fullLabel(dateStr) {
  const { weekday, day, month } = dateParts(dateStr);
  const suffix = dateStr === todayIST() ? " · Today" : "";
  return `${weekday}, ${day} ${month}${suffix}`;
}

function shortDayMonth(dateStr) {
  const { day, month } = dateParts(dateStr);
  return `${day} ${month}`;
}

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function presetRange(days) {
  const to = todayIST();
  return { from: addDays(to, -(days - 1)), to };
}

function thisMonthRange() {
  const to = todayIST();
  const [y, m] = to.split("-");
  return { from: `${y}-${m}-01`, to };
}

function monthBounds(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month
  return { from: `${monthStr}-01`, to: `${monthStr}-${pad2(lastDay)}` };
}

function monthLabelFull(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  return `${MONTHS_FULL[m - 1]} ${y}`;
}

// ---------- shared rendering ----------

let toastTimer = null;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function fmt(n) {
  return formatIndianNumber(Math.round(n || 0));
}

// Recomputes done/ignore/pending totals — and the below/above-₹2,000
// breakdown — from a list of transactions already held in memory.
function aggregateFromTxns(txns) {
  const agg = {
    total_done: 0,
    below_2000_done: 0,
    at_or_above_2000_done: 0,
    count_done: 0,
    count_ignore: 0,
    count_pending: 0,
    count_total: txns.length,
  };
  for (const t of txns) {
    if (t.status === "done") {
      agg.total_done += t.amount;
      agg[t.category + "_done"] += t.amount;
      agg.count_done += 1;
    } else if (t.status === "ignore") {
      agg.count_ignore += 1;
    } else {
      agg.count_pending += 1;
    }
  }
  return agg;
}

function summaryCardHTML(label, agg) {
  agg = agg || {};
  return `
    <div class="s-label">${label}</div>
    <div class="s-total mono">₹${fmt(agg.total_done)}</div>
    <div class="s-breakdown">
      <div class="s-breakdown-item"><span>Under ₹2,000</span><strong class="mono">₹${fmt(agg.below_2000_done)}</strong></div>
      <div class="s-breakdown-item"><span>₹2,000 &amp; above</span><strong class="mono">₹${fmt(agg.at_or_above_2000_done)}</strong></div>
    </div>
    <div class="s-meta">
      <span>${agg.count_done || 0} done</span>
      <span>${agg.count_pending || 0} pending</span>
      <span>${agg.count_ignore || 0} ignored</span>
    </div>
  `;
}

function txnRowHTML(t, { showDate }) {
  const when = showDate ? `${shortDayMonth(t.txn_date)} · ${t.txn_time}` : t.txn_time;
  const amountStr = t.amount % 1 ? t.amount.toFixed(2) : t.amount;
  return `
    <li class="txn-row" data-id="${t.id}">
      <div class="txn-info">
        <div class="txn-amount mono">₹${formatIndianNumber(amountStr)}</div>
        <div class="txn-meta">${when} · ${categoryLabel(t.category)}</div>
      </div>
      <div class="txn-status">
        <button class="status-btn done${t.status === "done" ? " active" : ""}" data-action="done">Done</button>
        <button class="status-btn ignore${t.status === "ignore" ? " active" : ""}" data-action="ignore">Ignore</button>
        <button class="delete-btn" data-action="delete" aria-label="Delete this transaction">
          <svg viewBox="0 0 448 512" class="delete-icon">
            <path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"></path>
          </svg>
        </button>
      </div>
    </li>
  `;
}

async function toggleTxnStatus(txn, action, onSettled) {
  const prevStatus = txn.status;
  txn.status = txn.status === action ? "pending" : action;
  onSettled();
  try {
    await updateTransactionStatus(txn.id, txn.status);
  } catch {
    txn.status = prevStatus;
    onSettled();
    showToast("Couldn't update — check your connection");
  }
}

// Deletion isn't optimistic (unlike Done/Ignore) — it only disappears from
// the list once the server has actually confirmed it's gone, since it can't
// be undone.
async function handleDelete(txn, onDeleted) {
  const amountStr = formatIndianNumber(txn.amount % 1 ? txn.amount.toFixed(2) : txn.amount);
  const confirmed = window.confirm(`Delete the ₹${amountStr} transaction? This can't be undone.`);
  if (!confirmed) return;

  try {
    await deleteTransaction(txn.id);
    onDeleted(txn.id);
  } catch {
    showToast("Couldn't delete — check your connection");
  }
}

function renderTxnList(container, txns, { showDate, findTxn, onChange, onDeleted }) {
  if (txns.length === 0) {
    container.innerHTML = `<div class="empty-state">No transactions in this period.</div>`;
    return;
  }
  container.innerHTML = txns.map((t) => txnRowHTML(t, { showDate })).join("");
  container.querySelectorAll(".txn-row").forEach((li) => {
    const id = Number(li.dataset.id);
    const txn = findTxn(id);
    li.querySelectorAll("[data-action]").forEach((btn) => {
      const action = btn.dataset.action;
      if (action === "delete") {
        btn.addEventListener("click", () => handleDelete(txn, onDeleted));
      } else {
        btn.addEventListener("click", () => toggleTxnStatus(txn, action, onChange));
      }
    });
  });
}

// ---------- view switching ----------

function showViewUI(view) {
  els.tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  els.dayView.classList.toggle("hidden", view !== "day");
  els.rangeView.classList.toggle("hidden", view !== "range");
  els.monthView.classList.toggle("hidden", view !== "month");
}

els.tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    showViewUI(view);
    if (view === "day") loadDayView();
    else if (view === "range") loadRangeView();
    else if (view === "month") loadMonthView();
  });
});

// ---------- Day view ----------

let dates = [];
let selectedDate = null;
let dayTxns = [];

async function loadDayView() {
  try {
    dates = await fetchDates();
  } catch {
    showToast("Couldn't load history");
    return;
  }
  if (dates.length === 0) return;
  if (!selectedDate || !dates.some((d) => d.txn_date === selectedDate)) {
    selectedDate = dates[0].txn_date;
  }
  renderDateRail();
  await loadDayTxns();
}

async function loadDayTxns() {
  try {
    dayTxns = await fetchTransactionsRange(selectedDate, selectedDate);
  } catch {
    showToast("Couldn't load that day's transactions");
    dayTxns = [];
  }
  recomputeDayAggregate();
  renderDateRail();
  renderDaySummary();
  renderDayList();
}

function recomputeDayAggregate() {
  const idx = dates.findIndex((d) => d.txn_date === selectedDate);
  if (idx >= 0) dates[idx] = { ...dates[idx], ...aggregateFromTxns(dayTxns) };
}

function renderDateRail() {
  els.dateRail.innerHTML = dates
    .map(
      (d) => `
    <button type="button" class="date-chip${d.txn_date === selectedDate ? " active" : ""}" data-date="${d.txn_date}">
      <div class="d-label">${chipLabel(d.txn_date)}</div>
      <div class="d-total mono">₹${fmt(d.total_done)}</div>
    </button>`
    )
    .join("");
  els.dateRail.querySelectorAll(".date-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedDate = btn.dataset.date;
      loadDayTxns();
    });
  });
}

function renderDaySummary() {
  const d = dates.find((x) => x.txn_date === selectedDate);
  els.daySummary.innerHTML = summaryCardHTML(fullLabel(selectedDate), d);
}

function renderDayList() {
  renderTxnList(els.dayTxnList, dayTxns, {
    showDate: false,
    findTxn: (id) => dayTxns.find((t) => t.id === id),
    onChange: () => {
      recomputeDayAggregate();
      renderDateRail();
      renderDaySummary();
      renderDayList();
    },
    onDeleted: (id) => {
      dayTxns = dayTxns.filter((t) => t.id !== id);
      recomputeDayAggregate();
      renderDateRail();
      renderDaySummary();
      renderDayList();
    },
  });
}

// ---------- Range view ----------

let rangeFrom = null;
let rangeTo = null;
let rangeAgg = null;
let rangeTxns = [];

function updatePresetActiveState() {
  const options = { 7: presetRange(7), 30: presetRange(30), month: thisMonthRange() };
  els.presetButtons.forEach((btn) => {
    const r = options[btn.dataset.preset];
    btn.classList.toggle("active", r.from === rangeFrom && r.to === rangeTo);
  });
}

async function applyRange(from, to) {
  rangeFrom = from;
  rangeTo = to;
  els.rangeFromInput.value = from;
  els.rangeToInput.value = to;
  updatePresetActiveState();

  try {
    const [summary, txns] = await Promise.all([fetchSummary(from, to), fetchTransactionsRange(from, to)]);
    rangeAgg = summary;
    rangeTxns = txns;
  } catch {
    showToast("Couldn't load that range");
    rangeAgg = null;
    rangeTxns = [];
  }
  renderRangeSummary();
  renderRangeList();
}

async function loadRangeView() {
  if (!rangeFrom || !rangeTo) {
    const r = presetRange(7);
    await applyRange(r.from, r.to);
  } else {
    await applyRange(rangeFrom, rangeTo);
  }
}

function renderRangeSummary() {
  const label = `${shortDayMonth(rangeFrom)} – ${shortDayMonth(rangeTo)}`;
  els.rangeSummary.innerHTML = summaryCardHTML(label, rangeAgg);
}

function renderRangeList() {
  renderTxnList(els.rangeTxnList, rangeTxns, {
    showDate: true,
    findTxn: (id) => rangeTxns.find((t) => t.id === id),
    onChange: () => {
      rangeAgg = aggregateFromTxns(rangeTxns);
      renderRangeSummary();
      renderRangeList();
    },
    onDeleted: (id) => {
      rangeTxns = rangeTxns.filter((t) => t.id !== id);
      rangeAgg = aggregateFromTxns(rangeTxns);
      renderRangeSummary();
      renderRangeList();
    },
  });
}

els.presetButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.preset;
    const r = key === "7" ? presetRange(7) : key === "30" ? presetRange(30) : thisMonthRange();
    applyRange(r.from, r.to);
  });
});

els.rangeApplyBtn.addEventListener("click", () => {
  const from = els.rangeFromInput.value;
  const to = els.rangeToInput.value;
  if (!from || !to) {
    showToast("Pick both a from and to date");
    return;
  }
  if (from > to) {
    showToast("'From' must be before 'To'");
    return;
  }
  applyRange(from, to);
});

// ---------- Month view ----------

let months = [];

async function loadMonthView() {
  try {
    months = await fetchMonths();
  } catch {
    showToast("Couldn't load monthly summaries");
    months = [];
  }
  renderMonthList();
}

function monthCardHTML(m) {
  return `
    <li class="month-card" data-month="${m.month}">
      <div class="s-label">${monthLabelFull(m.month)}</div>
      <div class="s-total mono">₹${fmt(m.total_done)}</div>
      <div class="s-breakdown">
        <div class="s-breakdown-item"><span>Under ₹2,000</span><strong class="mono">₹${fmt(m.below_2000_done)}</strong></div>
        <div class="s-breakdown-item"><span>₹2,000 &amp; above</span><strong class="mono">₹${fmt(m.at_or_above_2000_done)}</strong></div>
      </div>
      <div class="s-meta"><span>${m.count_done || 0} done</span></div>
    </li>
  `;
}

function renderMonthList() {
  if (months.length === 0) {
    els.monthList.innerHTML = `<div class="empty-state">No data yet.</div>`;
    return;
  }
  els.monthList.innerHTML = months.map(monthCardHTML).join("");
  els.monthList.querySelectorAll(".month-card").forEach((card) => {
    card.addEventListener("click", () => {
      const bounds = monthBounds(card.dataset.month);
      showViewUI("range");
      applyRange(bounds.from, bounds.to);
    });
  });
}

// ---------- init ----------

async function init() {
  try {
    dates = await fetchDates();
  } catch {
    els.skeleton.textContent = "Couldn't load history — check your connection.";
    return;
  }

  els.skeleton.classList.add("hidden");

  if (dates.length === 0) {
    els.emptyState.classList.remove("hidden");
    return;
  }

  els.viewTabs.classList.remove("hidden");
  showViewUI("day");
  selectedDate = dates[0].txn_date;
  renderDateRail();
  await loadDayTxns();
}

init();
