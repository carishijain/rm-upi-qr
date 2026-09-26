import { initTheme } from "./theme.js";
import { formatIndianNumber, amountToWords } from "./format.js";
import { payeeForAmount, buildUpiLink } from "./payees.js";
import { createTransaction } from "./api.js";

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
};

let currentUpiLink = "";
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
  await showQr(amountValue());
});

// ---------- QR generation ----------

async function showQr(amount) {
  const payee = payeeForAmount(amount);
  currentUpiLink = buildUpiLink(payee, amount);
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
    const blob = await new Promise((resolve) => els.qrCanvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Canvas produced no image");
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

render();
