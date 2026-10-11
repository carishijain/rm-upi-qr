// Builds the image that "Share QR code" hands to the native share sheet:
// the same brand card from the approved mockup, with the real QR composited
// into the placeholder square and the real UPI ID drawn in as text.
//
// Note on that UPI ID text: everywhere else in this app, the real UPI ID is
// deliberately never shown (see payees.js). This card is the one deliberate
// exception, by request — it exists so a customer who later reopens a saved
// copy of this image and scans it from their photo gallery (rather than
// live) still has a way to pay if their UPI app blocks gallery-scanned
// payments of ₹2,000 or more: they can type the ID shown on the card
// instead. The ID shown always matches whichever account this exact QR
// actually pays into.

import { formatIndianNumber } from "./format.js";

const SCALE = 2; // renders at 2x the mockup's 553×1102 for a crisp share image
const W = 553 * SCALE;
const H = 1102 * SCALE;

const BG = "#fbf7ee";
const INK = "#0a0a0a";
const NOTE_COLOR = "#2c2c2c";
const SPARKLE_COLOR = "#d9d4c7";
const FONT = "Montserrat, -apple-system, sans-serif";

const NOTE_TEXT =
  "While Scanning QR from gallery, payments for amounts exceeding ₹2000 cannot be made, please use above upi id for the same";

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSparkle(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.18, cy - r * 0.18, cx + r, cy);
  ctx.quadraticCurveTo(cx + r * 0.18, cy + r * 0.18, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.18, cy + r * 0.18, cx - r, cy);
  ctx.quadraticCurveTo(cx - r * 0.18, cy - r * 0.18, cx, cy - r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Shrinks the font size until a single line of text fits maxWidth.
function fitSingleLine(ctx, text, maxWidth, startPx, minPx, weight) {
  let size = startPx;
  while (size > minPx) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2 * SCALE;
  }
  return size;
}

async function ensureFontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`700 ${58 * SCALE}px ${FONT}`),
      document.fonts.load(`700 ${34 * SCALE}px ${FONT}`),
      document.fonts.load(`500 ${27 * SCALE}px ${FONT}`),
    ]);
    await document.fonts.ready;
  } catch {
    // If the Font Loading API isn't available, canvas just falls back to a
    // default sans-serif — not worth failing the whole share over.
  }
}

// Returns a Promise<Blob|null> for the finished PNG.
export async function buildShareCardBlob({ upiLink, upiId }) {
  await ensureFontsReady();

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // "Raj Machinery" wordmark
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${58 * SCALE}px ${FONT}`;
  ctx.fillText("Raj Machinery", 46 * SCALE, 108 * SCALE);

  // QR square — a soft white plate behind it, then the real QR drawn in
  const qrBoxSize = 305 * SCALE;
  const qrBoxX = (W - qrBoxSize) / 2;
  const qrBoxY = 210 * SCALE;
  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 20 * SCALE);
  ctx.fill();

  const qrInset = 22 * SCALE;
  const qrDrawSize = qrBoxSize - qrInset * 2;
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, upiLink, {
    width: qrDrawSize,
    margin: 0,
    color: { dark: "#1a2420", light: "#ffffff" },
  });
  ctx.drawImage(qrCanvas, qrBoxX + qrInset, qrBoxY + qrInset, qrDrawSize, qrDrawSize);

  // The real UPI ID — the one deliberate exception, see file header.
  const idMaxWidth = W - 2 * 46 * SCALE;
  const idFontSize = fitSingleLine(ctx, upiId, idMaxWidth, 40 * SCALE, 20 * SCALE, 700);
  ctx.font = `700 ${idFontSize}px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.fillText(upiId, W / 2, 668 * SCALE);

  // Explanatory note, wrapped and centered
  ctx.font = `500 ${25 * SCALE}px ${FONT}`;
  ctx.fillStyle = NOTE_COLOR;
  const noteLines = wrapText(ctx, NOTE_TEXT, W - 2 * 58 * SCALE);
  const lineHeight = 42 * SCALE;
  let noteY = 782 * SCALE;
  for (const line of noteLines) {
    ctx.fillText(line, W / 2, noteY);
    noteY += lineHeight;
  }

  // Small decorative sparkle, matching the mockup
  drawSparkle(ctx, W / 2, 985 * SCALE, 14 * SCALE, SPARKLE_COLOR);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// ---------- split-payment share card (grid of QR codes) ----------
//
// Matches the second mockup: brand header, the shared UPI ID once at the
// top (every chunk pays into the same below-₹2,000 account), then as many
// QR codes as there are chunks, two per row, each labelled with its own
// amount. The canvas grows to fit however many are needed — there's no
// fixed cap at 6; a "huge" amount just produces a taller image.

const GRID_W = 1179;
const GRID_MARGIN = 90;
const GRID_INK = "#000000";
const GRID_SUB_COLOR = "#2c2c2c";
const GRID_QR_SIZE = 300;
const GRID_ROW_GAP = 60;
const GRID_CAPTION_GAP = 28;
const GRID_CAPTION_HEIGHT = 40;

// Returns a Promise<Blob|null> for the finished PNG.
export async function buildSplitShareCardBlob({ chunks, upiId }) {
  await ensureFontsReady();

  const numRows = Math.ceil(chunks.length / 2);
  const rowHeight = GRID_QR_SIZE + GRID_CAPTION_GAP + GRID_CAPTION_HEIGHT + GRID_ROW_GAP;
  const gridTop = 400;
  const gridH = gridTop + numRows * rowHeight - GRID_ROW_GAP + 70;

  const canvas = document.createElement("canvas");
  canvas.width = GRID_W;
  canvas.height = gridH;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, GRID_W, gridH);

  // "Raj Machinery" + location
  ctx.fillStyle = GRID_INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 68px ${FONT}`;
  ctx.fillText("Raj Machinery", GRID_MARGIN, 150);
  ctx.font = `500 34px ${FONT}`;
  ctx.fillStyle = GRID_SUB_COLOR;
  ctx.fillText("Mulund (W), Mumbai", GRID_MARGIN, 205);

  // Shared UPI ID — every QR below pays into this same account
  const upiLine = "UPI ID: " + upiId;
  const upiFontSize = fitSingleLineAt(ctx, upiLine, GRID_W - GRID_MARGIN * 2, 44, 22, 700);
  ctx.font = `700 ${upiFontSize}px ${FONT}`;
  ctx.fillStyle = GRID_INK;
  ctx.fillText(upiLine, GRID_MARGIN, 300);

  // The QR grid itself
  const leftX = GRID_MARGIN;
  const rightX = GRID_W - GRID_MARGIN - GRID_QR_SIZE;

  for (let i = 0; i < chunks.length; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = col === 0 ? leftX : rightX;
    const y = gridTop + row * rowHeight;
    const chunkAmount = chunks[i];

    const link = buildSplitLinkForShare(upiId, chunkAmount);
    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, link, {
      width: GRID_QR_SIZE,
      margin: 1,
      color: { dark: "#1a2420", light: "#ffffff" },
    });
    ctx.drawImage(qrCanvas, x, y, GRID_QR_SIZE, GRID_QR_SIZE);

    const captionY = y + GRID_QR_SIZE + GRID_CAPTION_GAP + GRID_CAPTION_HEIGHT * 0.7;
    ctx.font = `700 32px ${FONT}`;
    ctx.fillStyle = GRID_INK;
    ctx.textAlign = "center";
    ctx.fillText(
      `QR ${i + 1} · ₹${formatIndianNumber(chunkAmount.toFixed(chunkAmount % 1 ? 2 : 0))}`,
      x + GRID_QR_SIZE / 2,
      captionY
    );
  }

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// Same upi://pay format as payees.js's buildUpiLink, duplicated here so this
// file doesn't need to import the payee config just for link-building.
function buildSplitLinkForShare(upiId, amount) {
  const enc = encodeURIComponent;
  return (
    `upi://pay?pa=${upiId}` +
    `&pn=${enc("Raj Machinery")}` +
    `&am=${enc(amount.toFixed(2))}` +
    `&cu=INR` +
    `&tn=${enc("Payment to Raj Machinery")}`
  );
}

// Like fitSingleLine, but for left-aligned text (fitSingleLine assumes the
// text will be drawn centered; the starting font size/weight here are
// passed explicitly since this card uses different sizes than the first).
function fitSingleLineAt(ctx, text, maxWidth, startPx, minPx, weight) {
  let size = startPx;
  while (size > minPx) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}
