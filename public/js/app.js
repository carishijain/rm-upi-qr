import { initTheme } from "./theme.js";
import { formatIndianNumber, amountToWords } from "./format.js";
import { THRESHOLD, PAYEE_BELOW, payeeForAmount, buildUpiLink, splitIntoChunks } from "./payees.js";
import { createTransaction } from "./api.js";
import { buildShareCardBlob, buildSplitShareCardBlob } from "./sharecard.js";

initTheme();

const MAX_INT_DIGITS = 8; // up to 9,99,99,999 — comfortably above shop-till amounts

let amountStr = "";

const els = {
  amountText: document.getElementById("amount-text"),
  generateBtn: document.getElementById("generate-btn"),
  keypad: document.getElementById("keypad"),
  entryView: document.getElementById("entry-view"),
  qrView: document.getElementById("qr-view"),
  qrAmountText: document.getElementById("qr-amount-text"),
  qrCanvas: document.getElementById("qr-canvas"),
  saveNote: document.getElementById("save-note"),
  shareQrBtn: document.getElementById("share-qr-btn"),
  copyLinkBtn: document.getElementById("copy-link-btn"),
  newPaymentBtn: document.getElementById("new-payment-btn"),
  modal: document.getElementById("confirm-modal"),
  confirmAmountText: document.getElementById("confirm-amount-text"),
  confirmWordsText: document.getElementById("confirm-words-text"),
  confirmYes: document.getElementById("confirm-yes"),
  confirmNo: document.getElementById("confirm-no"),
  toast: document.getElementById("toast"),

  modeModal: document.getElementById("mode-modal"),
  modeAmountText: document.getElementById("mode-amount-text"),
  modeDirectBtn: document.getElementById("mode-direct"),
  modeSplitBtn: document.getElementById("mode-split"),

  splitView: document.getElementById("split-view"),
  splitTotalText: document.getElementById("split-total-text"),
  splitSubText: document.getElementById("split-sub-text"),
  splitQrList: document.getElementById("split-qr-list"),
  splitShareBtn: document.getElementById("split-share-btn"),
  splitNewPaymentBtn: document.getElementById("split-new-payment-btn"),
  splitSaveNote: document.getElementById("split-save-note"),
};

let currentUpiLink = "";
let currentUpiId = "";
let currentAmount = 0;
let toastTimer = null;

// iOS Safari/Chrome (and some other modern browsers) can share an actual
// image file to the native share sheet. Desktop browsers generally can't,
// so the button only appears where it will actually work.
function canShareFiles() {
  try {
    if (!navigator.canShare) return false;
    const probe = new File([new Blob(["x"])], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}
const SHARE_FILES_SUPPORTED = canShareFiles();

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function amountValue() {
  const n = parseFloat(amountStr);
  return Number.isFinite(n) ? n : 0;
}

function render() {
  els.amountText.textContent = amountStr ? formatIndianNumber(amountStr) : "0";
  els.generateBtn.disabled = amountValue() <= 0;
}

function pressKey(key) {
  if (key === "back") {
    amountStr = amountStr.slice(0, -1);
    render();
    return;
  }
  if (key === ".") {
    if (amountStr === "") amountStr = "0";
    if (amountStr.includes(".")) return;
    amountStr += ".";
    render();
    return;
  }
  // digit
  const [intPart, decPart] = amountStr.split(".");
  if (decPart !== undefined) {
    if (decPart.length >= 2) return; // max 2 paise digits
  } else if ((intPart || "").replace(/^0+(?=\d)/, "").length >= MAX_INT_DIGITS) {
    return;
  }
  if (amountStr === "0") amountStr = key;
  else amountStr += key;
  render();
}

els.keypad.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-key]");
  if (!btn) return;
  pressKey(btn.dataset.key);
});

// Long-press backspace clears the whole amount.
let holdTimer = null;
const backspaceBtn = document.getElementById("backspace-btn");
backspaceBtn.addEventListener("pointerdown", () => {
  holdTimer = setTimeout(() => {
    amountStr = "";
    render();
  }, 550);
});
["pointerup", "pointerleave", "pointercancel"].forEach((evt) =>
  backspaceBtn.addEventListener(evt, () => clearTimeout(holdTimer))
);

// ---------- Confirm modal ----------

els.generateBtn.addEventListener("click", () => {
  const amount = amountValue();
  if (amount <= 0) return;
  els.confirmAmountText.textContent = "₹" + formatIndianNumber(amount.toFixed(amount % 1 ? 2 : 0));
  els.confirmWordsText.textContent = amountToWords(amount);
  els.modal.classList.remove("hidden");
});

els.confirmNo.addEventListener("click", () => {
  els.modal.classList.add("hidden");
});

els.modal.addEventListener("click", (e) => {
  if (e.target === els.modal) els.modal.classList.add("hidden");
});

els.confirmYes.addEventListener("click", async () => {
  els.modal.classList.add("hidden");
  const amount = amountValue();
  if (amount >= THRESHOLD) {
    openModeModal(amount);
  } else {
    await showQr(amount);
  }
});

// ---------- Payment-mode choice (₹2,000+ only) ----------

let pendingModeAmount = 0;

function openModeModal(amount) {
  pendingModeAmount = amount;
  els.modeAmountText.textContent = "₹" + formatIndianNumber(amount.toFixed(amount % 1 ? 2 : 0));
  els.modeModal.classList.remove("hidden");
}

function closeModeModal() {
  els.modeModal.classList.add("hidden");
}

els.modeModal.addEventListener("click", (e) => {
  if (e.target === els.modeModal) closeModeModal();
});

els.modeDirectBtn.addEventListener("click", async () => {
  closeModeModal();
  await showQr(pendingModeAmount);
});

els.modeSplitBtn.addEventListener("click", async () => {
  closeModeModal();
  await showSplitQr(pendingModeAmount);
});

// ---------- QR generation ----------

async function showQr(amount) {
  const payee = payeeForAmount(amount);
  currentUpiLink = buildUpiLink(payee, amount);
  currentUpiId = payee.upi_id;
  currentAmount = amount;

  els.qrAmountText.textContent = "₹" + formatIndianNumber(amount.toFixed(amount % 1 ? 2 : 0));
  els.saveNote.textContent = "";
  els.saveNote.classList.remove("error");
  els.shareQrBtn.classList.toggle("hidden", !SHARE_FILES_SUPPORTED);

  els.entryView.classList.add("hidden");
  els.qrView.classList.remove("hidden");

  try {
    await QRCode.toCanvas(els.qrCanvas, currentUpiLink, {
      width: 232,
      margin: 1,
      color: { dark: "#1a2420", light: "#ffffff" },
    });
  } catch (err) {
    console.error("QR draw failed:", err);
    els.saveNote.textContent = "Couldn't draw the QR code. Try again.";
    els.saveNote.classList.add("error");
    return;
  }

  try {
    await createTransaction({
      amount,
      upi_id: payee.upi_id,
      bank_label: payee.bank_label,
    });
  } catch (err) {
    els.saveNote.textContent = "QR is ready to scan, but it couldn't be saved to History.";
    els.saveNote.classList.add("error");
  }
}

els.shareQrBtn.addEventListener("click", async () => {
  try {
    const blob = await buildShareCardBlob({ upiLink: currentUpiLink, upiId: currentUpiId });
    if (!blob) throw new Error("Card render produced no image");
    const file = new File([blob], "payment-qr.png", { type: "image/png" });
    await navigator.share({
      files: [file],
      title: "Payment QR",
      text: "Scan to pay ₹" + formatIndianNumber(currentAmount.toFixed(currentAmount % 1 ? 2 : 0)),
    });
  } catch (err) {
    if (err.name === "AbortError") return; // person cancelled the share sheet
    console.error("Share failed:", err);
    showToast("Couldn't open the share sheet");
  }
});

els.copyLinkBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentUpiLink);
    showToast("Payment link copied");
  } catch {
    showToast("Couldn't copy — long-press the link instead");
  }
});

els.newPaymentBtn.addEventListener("click", () => {
  amountStr = "";
  render();
  els.qrView.classList.add("hidden");
  els.entryView.classList.remove("hidden");
});

// ---------- Split-QR generation ----------

let currentSplitChunks = [];

async function showSplitQr(amount) {
  const chunks = splitIntoChunks(amount);
  currentSplitChunks = chunks;

  els.splitTotalText.textContent = "₹" + formatIndianNumber(amount.toFixed(amount % 1 ? 2 : 0));
  els.splitSubText.textContent = `Split into ${chunks.length} QR code${chunks.length === 1 ? "" : "s"} — each ₹1,999 or below`;
  els.splitSaveNote.textContent = "";
  els.splitSaveNote.classList.remove("error");
  els.splitShareBtn.classList.toggle("hidden", !SHARE_FILES_SUPPORTED);
  els.splitQrList.innerHTML = "";

  els.entryView.classList.add("hidden");
  els.splitView.classList.remove("hidden");

  let anySaveFailed = false;

  // Drawn and saved one at a time (not in parallel) so they appear
  // progressively rather than all popping in at once, and so a slow network
  // can't cause overlapping writes to the same canvas element.
  for (let i = 0; i < chunks.length; i++) {
    const chunkAmount = chunks[i];
    const link = buildUpiLink(PAYEE_BELOW, chunkAmount);

    const card = document.createElement("div");
    card.className = "split-qr-card";
    card.innerHTML = `
      <div class="split-qr-label">QR ${i + 1} of ${chunks.length} · ₹${formatIndianNumber(
      chunkAmount.toFixed(chunkAmount % 1 ? 2 : 0)
    )}</div>
      <div class="split-qr-canvas-wrap"><canvas></canvas></div>
    `;
    els.splitQrList.appendChild(card);

    try {
      await QRCode.toCanvas(card.querySelector("canvas"), link, {
        width: 200,
        margin: 1,
        color: { dark: "#1a2420", light: "#ffffff" },
      });
    } catch (err) {
      console.error("Split QR draw failed:", err);
    }

    try {
      await createTransaction({
        amount: chunkAmount,
        upi_id: PAYEE_BELOW.upi_id,
        bank_label: PAYEE_BELOW.bank_label,
      });
    } catch (err) {
      anySaveFailed = true;
    }
  }

  if (anySaveFailed) {
    els.splitSaveNote.textContent = "QR codes are ready to scan, but some couldn't be saved to History.";
    els.splitSaveNote.classList.add("error");
  }
}

els.splitShareBtn.addEventListener("click", async () => {
  try {
    const blob = await buildSplitShareCardBlob({ chunks: currentSplitChunks, upiId: PAYEE_BELOW.upi_id });
    if (!blob) throw new Error("Card render produced no image");
    const file = new File([blob], "payment-qr-codes.png", { type: "image/png" });
    await navigator.share({
      files: [file],
      title: "Payment QR Codes",
      text: `${currentSplitChunks.length} QR codes to scan`,
    });
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error("Split share failed:", err);
    showToast("Couldn't open the share sheet");
  }
});

els.splitNewPaymentBtn.addEventListener("click", () => {
  amountStr = "";
  render();
  els.splitView.classList.add("hidden");
  els.entryView.classList.remove("hidden");
});

render();
