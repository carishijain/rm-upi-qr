// Indian digit grouping (e.g. 12,45,900) and amount-in-words, used by the
// confirm modal so a mistyped amount is easy to catch before a QR is made.

export function formatIndianNumber(value) {
  const str = String(value);
  const [intPartRaw, decPart] = str.split(".");
  const neg = intPartRaw.startsWith("-");
  const digits = neg ? intPartRaw.slice(1) : intPartRaw;

  let last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  if (rest) {
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    last3 = "," + last3;
  }
  let out = (neg ? "-" : "") + rest + last3;
  if (decPart !== undefined) out += "." + decPart;
  return out;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitWords(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? " " + ONES[o] : "");
}

function threeDigitWords(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = "";
  if (h) out += ONES[h] + " Hundred";
  if (rest) out += (out ? " " : "") + twoDigitWords(rest);
  return out;
}

function integerToIndianWords(num) {
  if (num === 0) return "Zero";
  let n = num;
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  const rest = n;

  const parts = [];
  if (crore) parts.push(threeDigitWords(crore) + " Crore");
  if (lakh) parts.push(twoDigitWords(lakh) + " Lakh");
  if (thousand) parts.push(twoDigitWords(thousand) + " Thousand");
  if (rest) parts.push(threeDigitWords(rest));
  return parts.join(" ");
}

// The backend never sends bank names or UPI IDs to the browser — just one of
// these two generic category keys, which every screen displays the same way.
export function categoryLabel(category) {
  return category === "below_2000" ? "Under ₹2,000" : "₹2,000 & above";
}

export function amountToWords(amount) {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  let words = "Rupees " + integerToIndianWords(rupees);
  if (paise > 0) {
    words += " and " + integerToIndianWords(paise) + " Paise";
  }
  return words + " Only";
}
