// Which UPI ID a payment gets routed to. Edit here if the accounts or the
// threshold ever change — nothing else in the app needs to know about it.
//
// The account/bank details below (upi_id, bank_label) are used only to build
// the QR's payment link and to tag the saved transaction. Nothing in the
// app's own screens ever displays them — see format.js's categoryLabel()
// for the generic "Under ₹2,000" / "₹2,000 & above" wording shown instead.
// (Note: once a customer's own UPI app scans the code, it may show the
// actual account name registered with that VPA — that confirmation screen
// belongs to their banking app, not this site, so it's outside our control.)

export const THRESHOLD = 2000;

// Shown inside the UPI app as the suggested payee name — kept identical for
// both routes so the split itself isn't implied by the QR's own data either.
const DISPLAY_NAME = "Raj Machinery";

// bank_label here is only ever "below_2000" / "at_or_above_2000" — it's what
// gets saved with the transaction and sent over the network on every QR
// generated, so it never carries an actual bank/account name, even in a
// browser's network tab.
export const PAYEE_BELOW = {
  upi_id: "rajmachinerytools@oksbi",
  bank_label: "below_2000",
};

export const PAYEE_AT_OR_ABOVE = {
  upi_id: "rishijain232003@okhdfcbank",
  bank_label: "at_or_above_2000",
};

export function payeeForAmount(amount) {
  return amount < THRESHOLD ? PAYEE_BELOW : PAYEE_AT_OR_ABOVE;
}

// NPCI UPI deep link — the same "upi://pay" format used by every UPI QR.
// Built by hand (rather than URLSearchParams) so spaces come out as %20,
// matching the convention every UPI app expects; URLSearchParams would
// encode them as "+" instead.
export function buildUpiLink({ upi_id }, amount) {
  const enc = encodeURIComponent;
  return (
    `upi://pay?pa=${upi_id}` +
    `&pn=${enc(DISPLAY_NAME)}` +
    `&am=${enc(amount.toFixed(2))}` +
    `&cu=INR` +
    `&tn=${enc("Payment to " + DISPLAY_NAME)}`
  );
}
