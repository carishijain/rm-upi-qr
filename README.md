# RM UPI QR

A small, fast counter tool for taking UPI payments by QR code, with a day-wise
history you can reconcile at the end of each day. Built as a static frontend
+ Cloudflare Pages Functions + D1, so it's free to host and needs no server
to manage.

## How it works

1. **Home page** — type an amount on the on-screen keypad, tap **Generate QR**.
2. A confirm sheet shows the amount and its value in words, so a mistyped
   digit is easy to catch. Tap **Yes, confirm**.
3. A QR is drawn from a standard `upi://pay` deep link (the same format used
   by every UPI QR you'd see at a shop counter):
   - amount **under ₹2,000** → `rajmachinerytools@oksbi`
   - amount **₹2,000 or above** → `rishijain232003@okhdfcbank`
4. The transaction is saved (via the API, into D1) so it shows up in
   **History**.
5. **History page** — three tabs:
   - **Day** — pick a date from the rail, mark each transaction **Done**
     (money actually received) or **Ignore** (QR shown but not paid /
     duplicate / test). Tap a status again to undo it back to pending. The
     small round button on the right **permanently deletes** that row —
     tapping it asks you to confirm first, since it can't be undone.
   - **Range** — pick "Last 7 days" / "Last 30 days" / "This month", or set
     your own from/to dates, to see the total received over any period.
   - **Month** — every month you've ever used the app, each with its own
     total. Tap a month to jump into the Range tab pre-filled with that
     month's dates.

   Every total shown anywhere (Day, Range, or Month) also breaks down into
   **Under ₹2,000** and **₹2,000 & above** underneath the combined figure —
   those are just amount buckets, not account names; see the note below.

### On privacy

No bank name, account holder name, or UPI ID is ever displayed on the site,
sent to the browser in an API response, or included in the browser's own
outgoing requests — not even the "below/above ₹2,000" grouping reveals which
real account each bucket maps to. The **only** place either full UPI ID
lives is in `public/js/payees.js` (needed client-side to actually build the
QR) and in the `upi_id` column of your D1 database, which only you can query
from the Cloudflare dashboard.

QR scanning is the reliable path on every phone. There's also a **Copy
payment link** button for pasting the `upi://` link elsewhere — note iOS
Safari doesn't reliably hand `upi://` links to installed UPI apps the way
Android does, so treat that as a bonus, not the primary flow, on iPhone.

## Project structure

```
rm-upi-qr/
├── public/                  # static frontend — deployed as-is, no build step
│   ├── index.html           # amount entry + QR
│   ├── history.html         # day-wise history
│   ├── css/style.css
│   ├── js/                  # app.js, history.js, theme.js, api.js, format.js, payees.js
│   ├── icons/                # app icons (home-screen / favicon)
│   └── manifest.json
├── functions/api/           # Cloudflare Pages Functions (the backend)
│   ├── transactions/index.js    # GET (list, ?from=&to=) / POST (create)
│   ├── transactions/[id].js     # PATCH (mark Done/Ignore/Pending)
│   ├── dates.js                  # GET per-day totals, for the Day tab's rail
│   ├── summary.js                # GET totals for any ?from=&to= range
│   ├── months.js                 # GET totals per calendar month
│   └── _utils.js                 # shared helpers (IST date/time, JSON responses)
├── schema.sql                # D1 schema
├── wrangler.toml              # Pages + D1 binding config
└── package.json
```

## Deploy it

You'll need a free Cloudflare account and either the dashboard or the
[`wrangler`](https://developers.cloudflare.com/workers/wrangler/) CLI
(`npm install -g wrangler`, then `wrangler login`).

### 1. Create the D1 database

```bash
wrangler d1 create rm_upi_qr_db
```

This prints a `database_id`. Paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "rm_upi_qr_db"
database_id = "paste-it-here"
```

### 2. Apply the schema

```bash
wrangler d1 execute rm_upi_qr_db --remote --file=./schema.sql
```

(`npm run db:schema:remote` does the same thing, once `wrangler.toml` has
the real `database_id`.)

**Updating from an earlier version of this project?** A couple of test
transactions made before this update may still have `SBI` / `HDFC` stored
internally. Run this once, in the same D1 **Console** you used to apply the
schema, to bring them in line (harmless to run even if you have none):

```sql
UPDATE transactions SET bank_label = 'below_2000' WHERE bank_label = 'SBI';
UPDATE transactions SET bank_label = 'at_or_above_2000' WHERE bank_label = 'HDFC';
```

### 3. Deploy the site

**Easiest — Cloudflare dashboard:** push this folder to a GitHub repo, then
in the Cloudflare dashboard go to **Workers & Pages → Create → Pages →
Connect to Git**, pick the repo, and set:
- Build command: *(leave empty)*
- Build output directory: `public`

Then in the new project's **Settings → Functions → D1 database bindings**,
add a binding named `DB` pointing at `rm_upi_qr_db`. This step is required —
without it the API routes will 500.

**Or — CLI:**

```bash
wrangler pages deploy public --project-name=rm-upi-qr
```

Wrangler will pick up the `[[d1_databases]]` binding from `wrangler.toml`
automatically. If the CLI ever asks for a bind flag it doesn't recognize,
the dashboard method above is the more foolproof fallback.

### 4. Local development

```bash
npm run dev
```

This runs the site at `http://localhost:8788` against a **local** D1
replica. Apply the schema locally first:

```bash
npm run db:schema:local
```

## Editing the payment rule

Everything about *who gets paid and at what threshold* lives in one file:
`public/js/payees.js`. Change the two UPI IDs or the ₹2,000 cutoff there —
nothing else needs to change. Leave the two `bank_label` values
(`below_2000` / `at_or_above_2000`) as they are; the backend matches on
those exact strings to build the History page's totals.

If you ever add a third payee/threshold, the History page's "Under ₹2,000 /
₹2,000 & above" breakdown (in `functions/api/_utils.js`'s `CATEGORY_SUMS_SQL`
and in `format.js`'s `categoryLabel()`) would need a matching third bucket.

## Notes on the design

- Amounts are always shown in tabular figures, so digits stay lined up and
  are easy to double-check at a glance.
- All type is self-hosted Montserrat (`public/assets/fonts/`) rather than
  loaded from Google's servers — one less thing that can fail to load, and
  one less external request slowing down the first paint.
- The site opens in **Light Mode** by default on every device; the sun/moon
  button top-right toggles it, and each device remembers its own choice.
- On the QR screen, **Share QR code** opens the iPhone/Android native share
  sheet with the QR as an image (AirDrop, Messages, Photos, etc.) — it only
  appears on browsers that support sharing image files, so it won't show up
  on a desktop browser where it wouldn't work.
- The keypad (rather than a plain text field) keeps entry fast and avoids
  the iOS Safari zoom-on-focus behaviour that small number inputs trigger.
- The page can be added to the iPhone home screen (Share → Add to Home
  Screen) for a full-screen, app-like launch icon.
