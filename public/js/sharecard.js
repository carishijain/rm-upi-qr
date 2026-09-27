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
