const path = require('path');
const express = require('express');
const cache = require('./cache');
const { MANHATTAN_NEIGHBORHOODS } = require('./neighborhoods');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow the frontend (e.g. deployed separately on Vercel) to call this
// API cross-origin. It's a public read-only endpoint, so any origin is fine.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

/**
 * Does this event have any occurrence overlapping [minStart, minEnd)
 * (minutes from midnight)? Handles both single-window events and
 * multi-slot recurring events (the `occurrences` array).
 */
function overlapsTimeRange(event, minStart, minEnd) {
  const windows =
    event.occurrences && event.occurrences.length
      ? event.occurrences.map((o) => [o.startMin, o.endMin])
      : [[event.startMin, event.endMin]];

  return windows.some(([s, e]) => {
    if (s == null || e == null) return false;
    // Treat an end time before the start time (e.g. an event ending
    // after midnight) as running to the end of that day, rather than
    // wrapping — simpler and matches how these listings are written.
    const end = e < s ? 24 * 60 : e;
    return s < minEnd && end > minStart;
  });
}

/**
 * Parse a human-readable event date ("May 8, 2026") into an ISO
 * yyyy-mm-dd string. Anchoring to noon avoids the date shifting by a
 * day when toISOString() converts to UTC.
 */
function toISODate(str) {
  if (!str) return null;
  const d = new Date(`${str} 12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Does this event occur on the given ISO date? Multi-slot recurring
 * events (the `occurrences` array) must match one of their specific
 * dates; other events match if the date falls within [startDate, endDate].
 */
function occursOnDate(event, isoDate) {
  if (event.occurrences && event.occurrences.length) {
    return event.occurrences.some((o) => o.date === isoDate);
  }
  const start = toISODate(event.startDate);
  if (!start) return false;
  const end = toISODate(event.endDate) || start;
  return isoDate >= start && isoDate <= end;
}

app.get('/api/neighborhoods', (req, res) => {
  res.json({ neighborhoods: MANHATTAN_NEIGHBORHOODS });
});

app.get('/api/events', (req, res) => {
  const { events, lastUpdated, lastError } = cache.getState();
  const { borough, neighborhood, date, startMin, endMin, category } = req.query;

  let results = events;

  if (borough) {
    results = results.filter((e) => (e.borough || '').toLowerCase() === String(borough).toLowerCase());
  }

  if (neighborhood) {
    results = results.filter(
      (e) => (e.neighborhood || '').toLowerCase() === String(neighborhood).toLowerCase()
    );
  }

  if (category) {
    results = results.filter((e) => (e.category || '').toLowerCase() === String(category).toLowerCase());
  }

  if (date) {
    results = results.filter((ev) => occursOnDate(ev, String(date)));
  }

  if (startMin !== undefined && endMin !== undefined) {
    const s = parseInt(startMin, 10);
    const e = parseInt(endMin, 10);
    if (!Number.isNaN(s) && !Number.isNaN(e)) {
      results = results.filter((ev) => overlapsTimeRange(ev, s, e));
    }
  }

  res.json({
    count: results.length,
    lastUpdated,
    lastError,
    events: results,
  });
});

app.post('/api/refresh', async (req, res) => {
  const state = await cache.refresh();
  res.json({ count: state.events.length, lastUpdated: state.lastUpdated, lastError: state.lastError });
});

app.listen(PORT, () => {
  console.log(`NYC Free Events Finder running at http://localhost:${PORT}`);
  cache.start();
});
