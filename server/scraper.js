/**
 * Scraper for https://www.nycforfree.co/events
 *
 * The site server-renders every event card in the initial HTML response
 * (confirmed by fetching the page directly), so a plain HTTP GET + HTML
 * parse is enough — no headless browser required. Each card looks like:
 *
 *   <a class="events_list-card" href="/events/<slug>">
 *     <div class="events_list-category">Category Name</div>
 *     <img class="events_list-image" src="...">
 *     <div event-data="name">Event Title</div>
 *     <div event-data="description">...</div>
 *     <div class="text-size-tiny ...">Full street address</div>
 *     <div event-data="start-date">September 5, 2026</div>
 *     <div event-data="end-date">September 27, 2026</div>
 *     <div event-data="occurrences">2026-08-24|18:00|20:00,2026-08-31|18:00|20:00</div>
 *     <div event-data="start-time">7:00 PM</div>
 *     <div event-data="end-time">9:00 PM</div>
 *   </a>
 *
 * `occurrences` is only populated for events with multiple distinct
 * date/time slots (e.g. a weekly series). Single-run or single-window
 * events just rely on start-date/end-date + start-time/end-time.
 *
 * If nycforfree.co changes its markup, this is the one file that needs
 * updating — everything downstream consumes the normalized shape
 * returned by `scrapeEvents()`.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { guessNeighborhood } = require('./neighborhoods');

const EVENTS_URL = 'https://www.nycforfree.co/events';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Parse "7:00 PM" -> 19 * 60 + 0 minutes-from-midnight. Returns null if unparseable. */
function timeToMinutes(str) {
  if (!str) return null;
  const m = String(str)
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return null;
  let [, h, min, ap] = m;
  h = parseInt(h, 10);
  min = parseInt(min, 10);
  ap = ap.toUpperCase();
  if (ap === 'AM') {
    if (h === 12) h = 0;
  } else if (ap === 'PM') {
    if (h !== 12) h += 12;
  }
  return h * 60 + min;
}

/** Parse "2026-08-24|18:00|20:00" -> { date: '2026-08-24', startMin, endMin } */
function parseOccurrence(chunk) {
  const parts = chunk.split('|');
  if (parts.length !== 3) return null;
  const [date, start, end] = parts;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return null;
  return {
    date,
    startMin: sh * 60 + sm,
    endMin: eh * 60 + em,
  };
}

/** Try to guess which NYC borough an address string is in. */
function guessBorough(address) {
  if (!address) return null;
  const a = address.toLowerCase();
  if (/\bbrooklyn\b/.test(a)) return 'Brooklyn';
  if (/\bqueens\b|\bflushing\b|\bastoria\b|\blong island city\b/.test(a)) return 'Queens';
  if (/\bbronx\b/.test(a)) return 'Bronx';
  if (/\bstaten island\b/.test(a)) return 'Staten Island';
  // Manhattan zip codes are 100xx (with a few 100xx variants) or explicit borough words.
  const zipMatch = a.match(/\b(\d{5})\b/);
  if (/\bmanhattan\b|\bnew york, ny\b|\bnew york, new york\b/.test(a)) {
    if (zipMatch) {
      const zip = parseInt(zipMatch[1], 10);
      if (zip >= 10001 && zip <= 10282) return 'Manhattan';
    } else {
      return 'Manhattan';
    }
  }
  if (zipMatch) {
    const zip = parseInt(zipMatch[1], 10);
    if (zip >= 10001 && zip <= 10282) return 'Manhattan';
  }
  return null;
}

function cleanText($el) {
  return $el.text().replace(/\s+/g, ' ').trim();
}

function parseEventCard($, el) {
  const $card = $(el);
  const href = $card.attr('href') || '';
  const url = href.startsWith('http') ? href : `https://www.nycforfree.co${href}`;
  const slug = href.split('/').filter(Boolean).pop() || null;

  const category = cleanText($card.find('.events_list-category').first());
  const imageSrc = $card.find('img.events_list-image').first().attr('src') || null;

  const name = cleanText($card.find('[event-data="name"]').first());
  const description = cleanText($card.find('[event-data="description"]').first());
  const address = cleanText($card.find('.text-size-tiny').first());

  const startDate = cleanText($card.find('[event-data="start-date"]').first());
  const endDate = cleanText($card.find('[event-data="end-date"]').first());
  const startTime = cleanText($card.find('[event-data="start-time"]').first());
  const endTime = cleanText($card.find('[event-data="end-time"]').first());
  const occurrencesRaw = cleanText($card.find('[event-data="occurrences"]').first());

  const occurrences = occurrencesRaw
    ? occurrencesRaw
        .split(',')
        .map((c) => parseOccurrence(c.trim()))
        .filter(Boolean)
    : [];

  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const borough = guessBorough(address);
  const neighborhood = borough === 'Manhattan' ? guessNeighborhood(address) : null;

  if (!name || !url) return null;

  return {
    slug,
    url,
    name,
    category: category || null,
    description: description || null,
    imageSrc,
    address: address || null,
    borough,
    neighborhood,
    startDate: startDate || null,
    endDate: endDate || null,
    startTime: startTime || null,
    endTime: endTime || null,
    startMin,
    endMin,
    occurrences, // [{ date, startMin, endMin }, ...] — only for multi-slot events
  };
}

/**
 * Parse a raw HTML string of the events page into normalized event objects.
 * Pure/synchronous and network-free, so it's the piece unit tests exercise
 * directly against a saved fixture.
 * @param {string} html
 * @returns {Array<object>}
 */
function parseHtml(html) {
  const $ = cheerio.load(html);
  const cards = $('a.events_list-card').toArray();

  return cards
    .map((el) => parseEventCard($, el))
    .filter(Boolean)
    // De-dupe by slug in case the page repeats a card (e.g. featured + list sections).
    .filter((ev, idx, arr) => arr.findIndex((e) => e.slug === ev.slug) === idx);
}

/**
 * Fetch and parse the events page.
 * @returns {Promise<Array<object>>} normalized event objects
 */
async function scrapeEvents() {
  const { data: html } = await axios.get(EVENTS_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
    timeout: 20000,
  });

  return parseHtml(html);
}

module.exports = {
  scrapeEvents,
  parseHtml,
  timeToMinutes,
  parseOccurrence,
  guessBorough,
  EVENTS_URL,
};

// Allow `npm run scrape` for a quick manual check from the CLI.
if (require.main === module) {
  scrapeEvents()
    .then((events) => {
      console.log(`Scraped ${events.length} events.\n`);
      console.log(JSON.stringify(events.slice(0, 3), null, 2));
    })
    .catch((err) => {
      console.error('Scrape failed:', err.message);
      process.exit(1);
    });
}
