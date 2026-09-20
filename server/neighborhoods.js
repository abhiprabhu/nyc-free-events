/**
 * NYC For Free's own filters only go down to the borough level (Manhattan,
 * Brooklyn, Queens, Bronx, Staten Island) — there's no neighborhood field
 * in the underlying data. To get a neighborhood-level dropdown for
 * Manhattan we approximate it from the event's street address, first by
 * ZIP code (reliable when present) and then by keyword matching on
 * well-known place names as a fallback.
 *
 * This is a best-effort heuristic, not authoritative — ZIP-to-neighborhood
 * boundaries don't line up perfectly with how New Yorkers actually divide
 * up the island, and some ZIPs straddle two commonly-named areas. Good
 * enough for "roughly where is this," not for anything that needs to be
 * exact.
 */

// Ordered list of Manhattan neighborhoods, north to south-ish, for the dropdown.
const MANHATTAN_NEIGHBORHOODS = [
  'Inwood',
  'Washington Heights',
  'Harlem',
  'East Harlem',
  'Morningside Heights',
  'Upper West Side',
  'Upper East Side',
  'Roosevelt Island',
  'Hell\'s Kitchen',
  'Midtown',
  'Midtown East',
  'Murray Hill',
  'Kips Bay',
  'Chelsea',
  'Flatiron',
  'Gramercy',
  'Union Square',
  'Greenwich Village',
  'East Village',
  'West Village',
  'SoHo',
  'Nolita',
  'Little Italy',
  'Chinatown',
  'Lower East Side',
  'Tribeca',
  'Financial District',
  'Battery Park City',
];

// ZIP -> neighborhood. Covers the common Manhattan ZIP codes.
const ZIP_TO_NEIGHBORHOOD = {
  10001: 'Chelsea',
  10002: 'Lower East Side',
  10003: 'East Village',
  10004: 'Financial District',
  10005: 'Financial District',
  10006: 'Financial District',
  10007: 'Tribeca',
  10009: 'East Village',
  10010: 'Gramercy',
  10011: 'Chelsea',
  10012: 'SoHo',
  10013: 'Tribeca',
  10014: 'West Village',
  10016: 'Murray Hill',
  10017: 'Midtown East',
  10018: 'Midtown',
  10019: 'Hell\'s Kitchen',
  10020: 'Midtown',
  10021: 'Upper East Side',
  10022: 'Midtown East',
  10023: 'Upper West Side',
  10024: 'Upper West Side',
  10025: 'Upper West Side',
  10026: 'Harlem',
  10027: 'Harlem',
  10028: 'Upper East Side',
  10029: 'East Harlem',
  10030: 'Harlem',
  10031: 'Harlem',
  10032: 'Washington Heights',
  10033: 'Washington Heights',
  10034: 'Inwood',
  10035: 'East Harlem',
  10036: 'Hell\'s Kitchen',
  10037: 'Harlem',
  10038: 'Financial District',
  10039: 'Harlem',
  10040: 'Washington Heights',
  10044: 'Roosevelt Island',
  10065: 'Upper East Side',
  10069: 'Upper West Side',
  10075: 'Upper East Side',
  10128: 'Upper East Side',
  10162: 'Upper East Side',
  10280: 'Battery Park City',
  10281: 'Battery Park City',
  10282: 'Battery Park City',
  // "Vanity" ZIPs assigned to individual Midtown skyscrapers (Rockefeller
  // Center, the Empire State Building, etc.) that don't show up in the
  // standard neighborhood ZIP list but are common in event addresses.
  10103: 'Midtown',
  10104: 'Midtown',
  10105: 'Midtown',
  10106: 'Midtown',
  10107: 'Midtown',
  10110: 'Midtown',
  10111: 'Midtown',
  10112: 'Midtown',
  10118: 'Midtown',
  10119: 'Midtown',
  10120: 'Midtown',
  10121: 'Midtown',
  10122: 'Midtown',
  10123: 'Midtown',
  10152: 'Midtown East',
  10153: 'Midtown East',
  10154: 'Midtown East',
  10155: 'Midtown East',
  10158: 'Midtown East',
  10165: 'Midtown East',
  10166: 'Midtown East',
  10167: 'Midtown East',
  10168: 'Midtown East',
  10169: 'Midtown East',
  10170: 'Midtown East',
  10171: 'Midtown East',
  10172: 'Midtown East',
  10173: 'Midtown East',
  10174: 'Midtown East',
  10175: 'Midtown East',
  10176: 'Midtown East',
  10177: 'Midtown East',
  10178: 'Midtown East',
  10199: 'Midtown',
};

// Fallback keyword matching against the raw address text, for entries with
// no ZIP or an unmapped one. Checked in order, first match wins, so more
// specific names should come before broader ones.
const KEYWORD_RULES = [
  [/inwood/i, 'Inwood'],
  [/washington heights/i, 'Washington Heights'],
  [/morningside heights/i, 'Morningside Heights'],
  [/harlem/i, 'Harlem'],
  [/roosevelt island/i, 'Roosevelt Island'],
  [/upper west side/i, 'Upper West Side'],
  [/upper east side/i, 'Upper East Side'],
  [/hell'?s kitchen|clinton/i, 'Hell\'s Kitchen'],
  [/times square/i, 'Midtown'],
  [/murray hill/i, 'Murray Hill'],
  [/kips bay/i, 'Kips Bay'],
  [/midtown east/i, 'Midtown East'],
  [/midtown/i, 'Midtown'],
  [/flatiron/i, 'Flatiron'],
  [/gramercy/i, 'Gramercy'],
  [/union square/i, 'Union Square'],
  [/chelsea/i, 'Chelsea'],
  [/greenwich village/i, 'Greenwich Village'],
  [/east village/i, 'East Village'],
  [/west village/i, 'West Village'],
  [/\bsoho\b/i, 'SoHo'],
  [/nolita/i, 'Nolita'],
  [/little italy/i, 'Little Italy'],
  [/chinatown/i, 'Chinatown'],
  [/lower east side/i, 'Lower East Side'],
  [/tribeca/i, 'Tribeca'],
  [/financial district|wall st/i, 'Financial District'],
  [/battery park city/i, 'Battery Park City'],
];

function guessNeighborhood(address) {
  if (!address) return null;

  const zipMatch = address.match(/\b(\d{5})\b/);
  if (zipMatch) {
    const zip = parseInt(zipMatch[1], 10);
    if (ZIP_TO_NEIGHBORHOOD[zip]) return ZIP_TO_NEIGHBORHOOD[zip];
  }

  for (const [pattern, neighborhood] of KEYWORD_RULES) {
    if (pattern.test(address)) return neighborhood;
  }

  return null; // Known to be Manhattan, but couldn't pin a neighborhood.
}

module.exports = {
  MANHATTAN_NEIGHBORHOODS,
  ZIP_TO_NEIGHBORHOOD,
  guessNeighborhood,
};
