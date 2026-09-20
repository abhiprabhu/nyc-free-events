# NYC Free Events Finder

A small full-stack app that scrapes [nycforfree.co/events](https://www.nycforfree.co/events)
and lets you filter free NYC events by **Manhattan neighborhood** and **time of day**
(presets for morning/afternoon/evening, or a custom start/end time).

## How it works

- **`server/scraper.js`** — fetches the events page and parses the event cards
  directly out of the server-rendered HTML (the page renders every event's
  name, category, address, date range, and start/end time in the initial
  HTML response — no headless browser or JS execution needed). Recurring
  events (e.g. a weekly series) expose a hidden per-date `occurrences` field
  in the markup with exact time slots, which the scraper picks up too.
- **`server/neighborhoods.js`** — the site's own filters only go down to the
  borough level, so Manhattan neighborhoods are approximated from each
  event's ZIP code (falling back to keyword matching on the address text).
  This is a heuristic, not authoritative — see "Known limitations" below.
- **`server/cache.js`** — scrapes on startup, then re-scrapes on a cron
  schedule (hourly by default) and keeps the latest results in memory plus a
  disk snapshot (`data/cache.json`) so a restart doesn't start empty.
- **`server/index.js`** — a small Express API (`/api/events`,
  `/api/neighborhoods`, `/api/refresh`) that the frontend calls.
- **`public/`** — a plain HTML/CSS/JS frontend with the filter UI. No build
  step, no framework — just fetch + DOM updates.

## Running it

```bash
npm install
npm start
```

Then open http://localhost:3000. On first boot it scrapes immediately, so
give it a few seconds before the event grid populates.

To scrape once from the CLI without starting the server (useful for
debugging selectors if the site's markup changes):

```bash
npm run scrape
```

To run the test suite (parses a saved real copy of the page and checks the
scraper's output against known events):

```bash
npm test
```

## Filters

- **Borough** — All / Manhattan / Brooklyn / Queens / Bronx / Staten Island.
- **Manhattan neighborhood** — only shown once "Manhattan" is selected as the
  borough; a dropdown of ~28 neighborhoods (Chelsea, SoHo, Upper West Side,
  Harlem, etc.).
- **Time of day** — presets (Morning 8 AM–12 PM, Afternoon 12 PM–5 PM,
  Evening 5 PM–12 AM) or "Custom range…", which reveals two dropdowns (in
  30-minute increments) so you can pick something like 10 AM to 1 PM.
- **Category** — populated dynamically from whatever categories are present
  in the current scrape (Music, Food, Beauty, Art, etc.).

Filtering by time keeps an event if **any** of its occurrences overlap the
selected window at all (not just events fully contained in it) — a 9 AM–6 PM
pop-up will show up if you filter for "Morning," since part of it happens
then.

## Known limitations

- **Neighborhood is a best-effort guess.** It's derived from ZIP code first,
  then a handful of address keywords. Some ZIPs straddle neighborhoods that
  New Yorkers would name differently (e.g. parts of 10014 are West Village,
  parts are the Meatpacking District), and generic addresses like
  "New York, NY" with no ZIP can only be placed at the borough level.
- **The scraper depends on nycforfree.co's current markup.** If they
  redesign the events page, `server/scraper.js` is the one file to update —
  the selectors and expected structure are documented at the top of that
  file. `npm test` will fail loudly if the shape changes in a way the
  scraper can't handle.
- **Single-instance cache.** The in-memory + JSON-file cache is fine for one
  server process; it isn't built for running multiple instances behind a
  load balancer (there's no shared store).
- Respect nycforfree.co's terms of use and don't hit their server more
  often than the default hourly schedule — the point of the cache is to
  scrape once and serve many requests from memory, not to scrape on every
  page load.

## Project layout

```
server/
  index.js          Express app + API routes
  scraper.js         HTML fetch + parse (the scraping logic)
  neighborhoods.js   Manhattan ZIP/keyword -> neighborhood mapping
  cache.js           in-memory cache + scheduled refresh
public/
  index.html         filter UI + event grid
  styles.css
  app.js             fetch calls, filter state, rendering
test/
  scraper.test.js    tests run against a saved real fixture
  fixture.html       a saved copy of the events page for offline tests
data/
  cache.json         (generated at runtime, not committed)
```
