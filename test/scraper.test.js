/**
 * Lightweight tests using Node's built-in assert module — no test framework
 * dependency needed. Run with `npm test`.
 *
 * test/fixture.html is a real saved copy of https://www.nycforfree.co/events
 * (fetched September 2026), used so these tests run offline/deterministically
 * and don't hammer the live site on every CI run. If nycforfree.co changes
 * its markup, re-save a fresh copy of the page here and these tests will
 * tell you what broke.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  parseHtml,
  timeToMinutes,
  parseOccurrence,
  guessBorough,
} = require('../server/scraper');
const { guessNeighborhood } = require('../server/neighborhoods');

function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('timeToMinutes');
test('parses standard AM/PM times', () => {
  assert.strictEqual(timeToMinutes('7:00 PM'), 19 * 60);
  assert.strictEqual(timeToMinutes('10:00 AM'), 10 * 60);
  assert.strictEqual(timeToMinutes('12:00 PM'), 12 * 60);
  assert.strictEqual(timeToMinutes('12:00 AM'), 0);
});
test('returns null for junk input', () => {
  assert.strictEqual(timeToMinutes(''), null);
  assert.strictEqual(timeToMinutes(undefined), null);
  assert.strictEqual(timeToMinutes('not a time'), null);
});

console.log('parseOccurrence');
test('parses date|start|end chunks', () => {
  const parsed = parseOccurrence('2026-08-24|18:00|20:00');
  assert.deepStrictEqual(parsed, { date: '2026-08-24', startMin: 18 * 60, endMin: 20 * 60 });
});

console.log('guessBorough');
test('detects boroughs from address text', () => {
  assert.strictEqual(guessBorough('171 East Dr, Brooklyn, NY 11225, USA'), 'Brooklyn');
  assert.strictEqual(guessBorough('45 Rockefeller Plaza, New York, NY 10111, USA'), 'Manhattan');
  assert.strictEqual(guessBorough('New York, NY'), 'Manhattan');
  assert.strictEqual(guessBorough('17-11 Grove St, Flushing, NY 11385, USA'), 'Queens');
});

console.log('guessNeighborhood');
test('maps known Manhattan zip codes', () => {
  assert.strictEqual(guessNeighborhood('58 Bowery, New York, NY 10013'), 'Tribeca');
  assert.strictEqual(guessNeighborhood('108 5th Ave, New York, NY 10011, USA'), 'Chelsea');
  assert.strictEqual(guessNeighborhood('40 E 14th St, New York, NY 10003, USA'), 'East Village');
});
test('falls back to keyword match when no zip helps', () => {
  assert.strictEqual(guessNeighborhood('Somewhere in SoHo, New York, NY'), 'SoHo');
});
test('returns null when nothing matches', () => {
  assert.strictEqual(guessNeighborhood('New York, NY'), null);
});

console.log('parseHtml (against real saved fixture)');
const fixtureHtml = fs.readFileSync(path.join(__dirname, 'fixture.html'), 'utf8');
const events = parseHtml(fixtureHtml);

test('finds a substantial number of events', () => {
  assert.ok(events.length > 50, `expected >50 events, got ${events.length}`);
});

test('every event has the required core fields', () => {
  events.forEach((ev) => {
    assert.ok(ev.name, `missing name for ${ev.url}`);
    assert.ok(ev.url, 'missing url');
    assert.ok(ev.slug, 'missing slug');
  });
});

test('no duplicate slugs', () => {
  const slugs = events.map((e) => e.slug);
  assert.strictEqual(new Set(slugs).size, slugs.length);
});

test('a known event parses with the expected shape', () => {
  const moliere = events.find((e) => e.slug === 'moliere-in-the-park-don-juan');
  assert.ok(moliere, 'expected to find the Molière event in the fixture');
  assert.strictEqual(moliere.category, 'Performance/Dance');
  assert.strictEqual(moliere.borough, 'Brooklyn');
  assert.strictEqual(moliere.startTime, '7:00 PM');
  assert.strictEqual(moliere.endTime, '9:00 PM');
});

test('a recurring event exposes parsed occurrences', () => {
  const iron = events.find((e) => e.slug === 'ironstrength');
  assert.ok(iron, 'expected to find IronStrength in the fixture');
  assert.ok(iron.occurrences.length >= 4, 'expected multiple occurrence slots');
  assert.deepStrictEqual(iron.occurrences[0], {
    date: '2026-08-24',
    startMin: 18 * 60,
    endMin: 20 * 60,
  });
});

test('a Manhattan event gets a neighborhood guess', () => {
  const wang = events.find((e) => e.slug === 'the-wang-contemporary-guest-house-welcome-home');
  assert.ok(wang, 'expected to find the Wang Contemporary event in the fixture');
  assert.strictEqual(wang.borough, 'Manhattan');
  assert.strictEqual(wang.neighborhood, 'Tribeca');
});

console.log(`\nParsed ${events.length} events from fixture.`);
if (process.exitCode) {
  console.error('\nSome tests failed.');
} else {
  console.log('\nAll tests passed.');
}
