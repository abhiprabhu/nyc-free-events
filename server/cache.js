/**
 * Very small in-memory cache with a periodic background refresh, plus a
 * best-effort disk snapshot so the server doesn't come up empty after a
 * restart. Good enough for a single-instance hobby/portfolio deployment;
 * swap for Redis or a DB-backed cache if this ever needs to run as
 * multiple instances.
 */

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { scrapeEvents } = require('./scraper');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'cache.json');
const REFRESH_CRON = process.env.SCRAPE_CRON || '0 * * * *'; // hourly by default

let state = {
  events: [],
  lastUpdated: null,
  lastError: null,
};

function ensureDataDir() {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.events)) {
        state = { ...state, ...parsed };
        console.log(
          `[cache] Loaded ${state.events.length} events from disk (last updated ${state.lastUpdated}).`
        );
      }
    }
  } catch (err) {
    console.warn('[cache] Could not read cache.json, starting empty:', err.message);
  }
}

function saveToDisk() {
  try {
    ensureDataDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('[cache] Could not write cache.json:', err.message);
  }
}

async function refresh() {
  try {
    const events = await scrapeEvents();
    state = {
      events,
      lastUpdated: new Date().toISOString(),
      lastError: null,
    };
    saveToDisk();
    console.log(`[cache] Refreshed: ${events.length} events at ${state.lastUpdated}.`);
  } catch (err) {
    state.lastError = err.message;
    console.error('[cache] Refresh failed:', err.message);
  }
  return state;
}

function getState() {
  return state;
}

/** Load whatever's on disk, then kick off an initial refresh and a recurring schedule. */
function start() {
  loadFromDisk();
  refresh(); // fire-and-forget initial refresh so data isn't stale on cold start
  cron.schedule(REFRESH_CRON, refresh);
  console.log(`[cache] Scheduled refresh: "${REFRESH_CRON}"`);
}

module.exports = { start, refresh, getState };
