# Mastermind Entertainment coupon leaderboard

Public leaderboard for Mastermind Entertainment events. Each promoter has a coupon code. The board ranks those codes by how many **paid tickets** used that code at the selected event.

The page is a static site. It reads [`config.json`](config.json) for the look and [`data.json`](data.json) for the counts. There is no server and no buyer information on the page.

## Run it locally

From this folder:

```bash
python3 -m http.server 8741
```

Open [http://127.0.0.1:8741/?event=black-white-party](http://127.0.0.1:8741/?event=black-white-party).

Any static file host works the same way. Paths in the page are relative, so it also works as a GitHub project site (`https://<user>.github.io/<repo>/`).

Share a specific event with either of these:

- `?event=black-white-party`
- `/black-white-party` on GitHub Pages (the included `404.html` sends that path to the query form)

## What the board shows

- Every code with at least one paid use, highest count first.
- Ties share a rank. `10`, `10`, `4` is shown as ranks 1, 1, and 2. Codes with the same count are ordered A–Z.
- Ranks 1–3 use gold, silver, and bronze laurel badges. Later ranks use silver badges.
- The silver bar is the count divided by the leader’s count.
- **Total tickets** is the sum of those coupon uses for the event, not a guess at tickets sold without a code.
- **Updated** is `generatedAt` from `data.json`, shown in Hawaii time.
- An event whose `leaderboard` is `null` shows **Coming soon**.

Changing the event updates the address bar, so the link can be copied from the browser.

## Change the look without code

Edit [`config.json`](config.json). Refresh the page. No build step.

Site-wide keys set the default. An event can override any of the same keys. Leave a key off the event to inherit the site value. `""` for an image means “no image”.

| Key | What it changes |
| --- | --- |
| `defaultEventId` | Event opened when the link has no `?event=` |
| `subtitle` | Line under the leaderboard title. The seeded line is `TRACKING GUEST SIGN-UPS IN REAL TIME`. |
| `boardLabel` | Middle heading. Seeded as `COUPON CODE LEADERBOARD`. |
| `footerKicker` | Tiny line above the footer name. The Black & White Party uses `THE`. |
| `maxRows` | How many codes to show. Ranking still uses the full list, then the tail is hidden. |
| `showBars` | `false` hides the silver progress bars. Counts stay. |
| `showTotal` | `false` hides the total-tickets line. |
| `showLastUpdated` | `false` hides the Hawaii timestamp. |
| `showEventSelector` | `false` hides the event dropdown. `?event=` still works. |
| `fonts.display` | Poster typeface. Files for Cinzel are in `assets/fonts/`. |
| `fonts.ui` | Small labels, the event menu, and the meta line. |
| `fonts.stylesheet` | CSS file that declares those families. Point this at another stylesheet to switch fonts. |
| `colors.background` | Page color behind the marble. |
| `colors.silver` | Main text. |
| `colors.gold` | Subtitle, laurels, event menu. |
| `colors.bronze` | Third-place badge. |
| `colors.muted` | Timestamp and secondary copy. |
| `colors.table` | Glass table fill. Any CSS color is fine, including `rgba(...)`. |
| `colors.glow` | Header and footer light. |
| `backgroundImage` | Full-bleed photo behind the marble. Root-relative to the site, such as `assets/room.jpg`, or an `https://` URL. |
| `logo` | Image centered above the title. |
| `sideLeft` / `sideRight` | Side art. Replace the SVG paths with your own photos. |
| `hideSides` | `true` hides both side slots. |
| `timezone` | Used for the “updated” line. Keep `Pacific/Honolulu` for HST. |

Each object in `events` also accepts:

| Key | What it changes |
| --- | --- |
| `id` | URL slug. `?event=` must match this. |
| `name` | Full event name. The sync matches GoHighLevel `sourceName` against this and `sourceNames`. |
| `shortName` | Label in the dropdown. |
| `title` | Accessible page title, and the poster title when `titleLines` is omitted. |
| `titleLines` | Poster lines. Three lines render as a small kicker, a large middle line, and a tracked bottom line (`THE` / `BLACK & WHITE` / `PARTY`). Two lines render as a large line plus a smaller line. |
| `footer` | Metallic line under the glow rule. |
| `sourceIds` | GoHighLevel order `sourceId` values that belong to this event. |
| `sourceNames` | Extra `sourceName` strings that should roll into this event. |
| `productId` | Stored on `data.json` for reference. It is not required to count orders. |
| `hidden` | `true` keeps the event off the public page. Its orders are not published as a separate discovered event. |

Example: give one event its own subtitle, colors, and photos.

```json
{
  "id": "havana-after-dark",
  "subtitle": "HAVANA NIGHTS AT THE ILIKAI",
  "colors": { "gold": "#e7c27a" },
  "backgroundImage": "assets/havana-bg.jpg",
  "sideLeft": "assets/havana-left.jpg",
  "sideRight": "assets/havana-right.jpg",
  "maxRows": 8,
  "showBars": true
}
```

Side images work best as tall portraits (about 900×1600), in black and white, with the subject toward the outer edge. JPG, PNG, and SVG all work. The shipped figures are original placeholders in `assets/side-left.svg` and `assets/side-right.svg`, not photos of guests. Swap the paths when you have art you can publish.

Cinzel and Montserrat are included under the SIL Open Font License. See `assets/fonts/OFL-Cinzel.txt` and `assets/fonts/OFL-Montserrat.txt`.

## Counts file

[`data.json`](data.json) is the only data the page fetches besides the config.

```json
{
  "version": 1,
  "generatedAt": "2026-11-10T02:26:00-10:00",
  "timezone": "Pacific/Honolulu",
  "locationId": "LFGGW386YaVHK0GGieC7",
  "source": "seed",
  "events": [
    {
      "id": "black-white-party",
      "name": "The Black & White Party",
      "orderSourceId": "6ab2cd81b8ef2920288fe2df",
      "orderSourceIds": ["6ab2cd81b8ef2920288fe2df"],
      "productId": "6ab2cd821c881dda605af0eb",
      "leaderboard": [
        { "code": "BWP", "uses": 17 }
      ],
      "totalTickets": 17
    }
  ]
}
```

`leaderboard: null` is the coming-soon state. Do not put names, emails, phone numbers, or contact ids in this file. It is served to anyone who opens the site.

The seeded Black & White Party counts are BWP 17, CONNOR 3, MEIGEN 2, and LEVI 1. The other events are present with an empty board until the first sync.

## Refresh counts from GoHighLevel

`scripts/sync-ghl.mjs` rebuilds `data.json` from the Payments API.

```bash
export GHL_API_KEY="your private integration token"
node scripts/sync-ghl.mjs
```

Add `--dry-run` to print the totals without writing the file.

The script will not call the API if `GHL_API_KEY` is missing, and it will not change `data.json` in that case.

What it calls, checked against the public [List Orders](https://marketplace.gohighlevel.com/docs/ghl/payments/list-orders/index.html) docs:

- `GET https://services.leadconnectorhq.com/payments/orders`
- Header `Authorization: Bearer <token>`
- Header `Version: 2021-07-28`
- Query `altId` = location id (default `LFGGW386YaVHK0GGieC7`, or `locationId` in config, or `GHL_LOCATION_ID`)
- Query `altType=location` and `locationId` (the same id). If GoHighLevel rejects `altType` with HTTP 400 or 422, the script retries with the documented `altId` query.
- `limit` and `offset` until every page is read. The response list may be `data` or `orders`, with `totalCount` or `total`.

The token needs the `payments/orders.readonly` scope on this sub-account (Private Integration Token or OAuth sub-account token).

An order is counted only when all of these are true:

- Order status is `paid` or `completed`, or payment status is `paid`.
- It is not refunded, void, cancelled, failed, unpaid, or partially paid.
- `sourceType` is `events_management` (override the list with `sourceTypes` in config).
- It has a non-empty `couponCode`. One order is one use. A blank `couponCode` is not filled in from anywhere else. If that field is missing entirely, `coupon.code` is used. `coupon.usageCount` is never used, because that number is global across events.
- `excludeTestOrders: true` also drops orders with `liveMode: false`. The default is to keep them.

Orders are grouped by `sourceId` (or `sourceName` when there is no id). Configured events claim a group when the id is listed in `sourceIds` or the name matches `name` / `sourceNames`. Several sources can roll into one event. Sources that match nothing become new events, slugged from the source name, unless `includeDiscoveredEvents` is `false`.

The script logs event ids and counts only. It refuses to write fields that look like contact, email, phone, or address data.

Check the script without a token:

```bash
node --test scripts/leaderboard.test.mjs scripts/sync-ghl.test.mjs
```

Node 20 or newer is required.

## Deploy on GitHub Pages

The public site is [https://mastermind808.github.io/coupon-leaderboard/](https://mastermind808.github.io/coupon-leaderboard/).

[`.github/workflows/sync.yml`](.github/workflows/sync.yml) deploys on every push to `main`, every day at **6:00 AM Hawaii time** (16:00 UTC; Hawaii does not observe daylight saving), and whenever you run the workflow by hand.

The sync step runs only when the `GHL_API_KEY` repository secret is set. If that secret is missing, the step prints a warning, leaves `data.json` as it is, and the deploy continues. A missing key does not fail the build.

Asset links are relative (`css/styles.css`, `config.json`, `assets/...`), so the board works at the project-site path `/coupon-leaderboard/` and inside an iframe.

One-time setup if Pages is not already on:

1. Open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
2. Open **Actions → Sync leaderboard and deploy** and confirm the latest run on `main` succeeded. Use **Run workflow** if it has not started.
3. Later, open **Settings → Secrets and variables → Actions** and add `GHL_API_KEY` so the daily job can refresh counts.

The workflow commits straight to `main` when counts change, so branch protection that blocks the Actions token will stop that commit. The deploy of the current files still runs in that same job before the next day’s sync.

Share a specific event with `https://mastermind808.github.io/coupon-leaderboard/?event=black-white-party`.

## Embed on Wix

Use **Add → Embed code → Embed a site** (or Popular embeds → Embed a site) and paste:

`https://mastermind808.github.io/coupon-leaderboard/?event=black-white-party`

GitHub Pages does not send `X-Frame-Options`, so the page can sit in an iframe. The page background is an opaque black, so a transparent iframe still looks solid. The layout follows the iframe width and does not scroll sideways.

Set the Wix element height to **800px on desktop** and **700px on mobile**. That fits the title, the four Black & White codes, the footer, and the total without an inner scrollbar. Add about 70px for each extra code if a later event shows more rows.
