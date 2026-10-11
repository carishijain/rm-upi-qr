# RM UPI QR

A small, fast counter tool for taking UPI payments by QR code, with a day-wise
history you can reconcile at the end of each day. Built as a static frontend
+ Cloudflare Pages Functions + D1, so it's free to host and needs no server
to manage.

## How it works

1. **Home page** — type an amount on the on-screen keypad, tap **Generate QR**.
2. A confirm sheet shows the amount and its value in words, so a mistyped
   digit is easy to catch. Tap **Yes, confirm**.
3. **Under ₹2,000** → a single QR is drawn immediately. **₹2,000 or above**
   → you're asked to choose:
   - **Pay Directly** — a single QR, same as always
     (`rishijain232003@okhdfcbank`).
   - **Split into Multiple QR Codes** — the amount is broken into chunks of
     ₹1,999 or less (e.g. ₹4,500 → ₹1,999 + ₹1,999 + ₹502), every chunk
     routed to `rajmachinerytools@oksbi`, drawn one below another on the
     page. **Share all as image** builds one combined picture of every QR
     in the split (brand header, the shared UPI ID, then the QR grid —
     however many that turns out to be; there's no fixed cap, a bigger
     amount just makes a taller image). Note this is drawn by
     `public/js/sharecard.js`'s `buildSplitShareCardBlob`, a second builder
     alongside the original single-QR one.
   Every QR, either way, is a standard `upi://pay` deep link — the same
   format used by every UPI QR you'd see at a shop counter.
4. Every QR generated (including each piece of a split payment) is saved as
   its own transaction (via the API, into D1), so each shows up and can be
   marked Done/Ignore/deleted separately in **History**.
5. **History page** — opening it asks for a password first (see below).
   Once unlocked, three tabs:
   - **Day** — pick a date from the rail, mark each transaction **Done**
     (money actually received) or **Ignore** (QR shown but not paid /
     duplicate / test). Tap a status again to undo it back to pending. The
     small round button on the right **permanently deletes** that row —
     tap it, it expands into a red "Delete" pill, and a confirmation popup
     opens right away ("Keep it" / "Delete").
   - **Range** — pick "Last 7 days" / "Last 30 days" / "This month", or set
     your own from/to dates, to see the total received over any period.
   - **Month** — every month you've ever used the app, each with its own
     total. Tap a month to jump into the Range tab pre-filled with that
     month's dates.

   Every total shown anywhere (Day, Range, or Month) also breaks down into
   **Under ₹2,000** and **₹2,000 & above** underneath the combined figure —
   those are just amount buckets, not account names; see the note below.
6. **After 11pm**, the home page shows a dismissible reminder — "Approve
   {today's date} transactions" — nudging you to go mark the day's
   transactions Done/Ignore. Tapping it opens History (password required, as
   above); tapping the small ✕ just dismisses it. Either way it won't
   reappear until the next day's 11pm. This one runs on the phone's own
   clock (`public/js/approve-badge.js`) since it's just a reminder, not a
   security control.

### History's password lock

Opening History asks for a password (seeded to **131523**) before showing
anything. This is a real server-side lock, not just a screen in front of the
same data — every History-related API endpoint (`/api/dates`,
`/api/transactions` for reading, `/api/summary`, `/api/months`, and
marking/deleting a transaction) rejects requests with no valid session,
independent of whatever the page itself is showing. The one exception is
*creating* a transaction (`POST /api/transactions`), which stays open since
that's what the public home page's QR generator calls — accepting a payment
doesn't require the History password, only reviewing past ones does.

Three wrong attempts locks it for 24 hours. That 24-hour clock is tracked
entirely by the server (`functions/api/auth/verify.js`, using the Worker's
own clock) — the on-screen countdown just displays what the server reports
and periodically re-asks it, so **changing your phone's date and time has no
effect on the lockout**, including on the lockout itself ending early. I
tested this specifically: the actual verify/status code was run against a
real database with time deliberately fast-forwarded by 24+ hours to confirm
the lockout both holds throughout and correctly lifts afterward, all via the
server's own clock — see the testing note at the end of this README for
details.

The password is never stored in plain text — only its SHA-256 hash, in the
`auth_state` table. To change it later: compute the new hash (you can ask
Claude, or run `echo -n "newpassword" | shasum -a 256` in a terminal) and in
the D1 **Console**, run:
```sql
UPDATE auth_state SET password_hash = 'paste-the-new-hash-here', failed_attempts = 0, locked_until = NULL WHERE id = 1;
```

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
│   ├── index.html           # amount entry + QR + approve-badge
│   ├── history.html         # password gate + day-wise history
│   ├── css/style-*.css      # date-stamped filename — see "about filenames" below
│   ├── js/
│   │   ├── app.js            # home page logic
│   │   ├── auth.js            # History's entry point — password gate, then
│   │   │                      # hands off to history-*.js once unlocked
│   │   ├── history-*.js       # History's real logic (date-stamped, see below)
│   │   ├── approve-badge.js   # the daily 11pm reminder on the home page
│   │   ├── theme.js, api.js, format.js, payees.js, sharecard.js, loader.js
│   ├── icons/                # app icons (home-screen / favicon)
│   └── manifest.json
├── functions/api/           # Cloudflare Pages Functions (the backend)
│   ├── auth/verify.js            # POST — check password, track attempts, lockout
│   ├── auth/status.js             # GET — authenticated? locked? how long left?
│   ├── transactions/index.js    # GET (list, ?from=&to=, needs a session) / POST (create, public)
│   ├── transactions/[id].js     # PATCH/DELETE/GET (all need a session)
│   ├── dates.js                  # GET per-day totals (needs a session)
│   ├── summary.js                # GET totals for any ?from=&to= range (needs a session)
│   ├── months.js                 # GET totals per calendar month (needs a session)
│   └── _utils.js                 # shared helpers — IST date/time, JSON responses,
│                                  # password hashing, cookies, session checks
├── schema.sql                # D1 schema
├── wrangler.toml              # Pages + D1 binding config
└── package.json
```

**About the date-stamped filenames** (`style-20261003.css`,
`history-20261003.js`): earlier updates to this project ran into a real
problem where a phone kept a cached copy of a changed file under its old
name. Renaming the file whenever its content changes sidesteps that
completely — a URL the browser has never requested can't be served from a
stale cache. If you edit these files yourself later, renaming them again
(and updating the two `<script>`/`<link>` tags that reference them) is the
most reliable way to guarantee a phone picks up the change.

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

**Already deployed and just adding the History password lock?** `schema.sql`
is safe to run again in full: every statement in it only creates something
if it doesn't already exist, so re-running it won't touch your existing
transactions. That adds the two new tables (`auth_state`, seeded with the
password, and `sessions`) this version needs. Simplest approach: open
`schema.sql` from this zip, copy the whole thing, paste it into the D1
**Console**, and run it. Afterwards, `SELECT COUNT(*) FROM auth_state;`
should show `1`.

**Why `schema.sql` contains no comments:** the dashboard's D1 Console
rejects pasted SQL that has a comment-only chunk in it (typically a `;`
inside a comment) with "The request is malformed: Requests without any
query are not supported." So this file is kept to plain statements only,
and anything worth explaining lives here in the README instead. If you add
to it, keep it that way. If the console ever still complains, run the
statements one at a time — they're separated by blank lines.

**Optional housekeeping:** expired login sessions are harmless (every
request re-checks the expiry) but pile up slowly. To sweep them, in the D1
Console run:
```sql
DELETE FROM sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
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

## The opening loading screen

Every time either page loads, a full-screen gearbox animation (four rotating
gears, from a design by Nawsome on Uiverse.io) plays for 4 seconds before
fading out. It's pure CSS — the rules live under `#app-loader` in the
stylesheet, scoped so they can't collide with anything else on the site —
and `public/js/loader.js` only handles the timing (show for 4s, fade over
0.4s, remove from the page). There's no canvas and no per-frame JavaScript,
so there's very little here that depends on how a particular browser
implements anything.

**Worth knowing:** since Home and History are separate page loads (not one
app), this plays on *every* visit to either page — including switching back
and forth between them. For a tool meant for fast, repeated use through a
work day, that may get old quickly. Two easy adjustments in
`public/js/loader.js`:
- Change `SHOW_DURATION_MS` (currently `4000`) to shorten it.
- Wrap the call to `initLoader()` at the bottom of the file in
  `if (!sessionStorage.getItem("seenLoader")) { initLoader(); sessionStorage.setItem("seenLoader", "1"); }`
  to show it only once per browser tab session, rather than on every page.

The gearbox's own colors (`#111`, `#555`, etc.) are fixed rather than tied
to the site's light/dark theme variables, matching the original design as
given — tell Claude if you'd like it to follow the theme instead.

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
  sheet with a branded card image (built by `public/js/sharecard.js`, QR
  composited in live) rather than a bare QR — it only appears on browsers
  that support sharing image files, so it won't show up on a desktop browser
  where it wouldn't work.

  This card is the **one deliberate exception** to "no UPI ID is ever shown"
  above: it prints the real UPI ID as text beneath the QR, by request, so
  that someone who reopens a saved copy of the image later and scans it from
  their photo gallery — where UPI apps commonly block payments of ₹2,000 or
  more — can still pay by typing that ID in manually. The ID shown always
  matches whichever account that specific QR actually pays into. Nothing
  else on the site does this.
- The keypad (rather than a plain text field) keeps entry fast and avoids
  the iOS Safari zoom-on-focus behaviour that small number inputs trigger.
- The page can be added to the iPhone home screen (Share → Add to Home
  Screen) for a full-screen, app-like launch icon.

## How the password lock was tested

Since this can't be tried on a real phone from where it was built, it was
tested a different way: the actual `functions/api/auth/verify.js` and
`status.js` code (not a rewritten copy) was run against a real SQLite
database standing in for D1, with JavaScript's `Date` temporarily overridden
so the code's own `Date.now()` calls believe 24+ hours have passed, without
the test actually waiting that long. That confirmed, against the real code:
three wrong passwords lock it; a correct password is still rejected while
locked; small amounts of time passing don't end the lockout early; once the
full 24 hours have genuinely elapsed (in the overridden clock) a fresh
attempt is allowed; and every History API endpoint rejects requests with no
valid session while the public QR-creation endpoint keeps working normally.
A separate test drove the actual on-screen password form the same way a
tapping finger would — wrong attempts, the switch to the locked countdown
view, the countdown visibly ticking down, and a successful unlock — and the
daily approve-badge was tested similarly, including the exact midnight IST
boundary where it needs to stop showing yesterday's date and start showing
today's. None of this replaces trying it on your own phone, which is still
worth doing, but it's considerably more than "it looks right."
