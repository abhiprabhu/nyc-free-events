const state = {
  neighborhoods: [],
  allEvents: [],
};

const els = {
  borough: document.getElementById('borough-select'),
  neighborhoodGroup: document.getElementById('neighborhood-group'),
  neighborhood: document.getElementById('neighborhood-select'),
  date: document.getElementById('date-input'),
  preset: document.getElementById('preset-select'),
  customGroup: document.getElementById('custom-time-group'),
  startTime: document.getElementById('start-time-select'),
  endTime: document.getElementById('end-time-select'),
  category: document.getElementById('category-select'),
  reset: document.getElementById('reset-btn'),
  list: document.getElementById('events-list'),
  resultCount: document.getElementById('result-count'),
  lastUpdated: document.getElementById('last-updated'),
};

// Preset windows expressed in minutes-from-midnight.
const PRESETS = {
  morning: { start: 8 * 60, end: 12 * 60 },
  afternoon: { start: 12 * 60, end: 17 * 60 },
  evening: { start: 17 * 60, end: 24 * 60 },
};

function minutesToLabel(mins) {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h24 < 12 || h24 === 24 ? 'AM' : 'PM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  if (h24 === 24) h12 = 12; // midnight-as-end-of-day
  return `${h12}:${String(m).padStart(2, '0')} ${h24 === 24 ? 'AM (midnight)' : ap}`;
}

function populateTimeDropdowns() {
  // 30-minute increments, 12:00 AM (0) through 11:30 PM (1410), plus midnight (1440) as an end option.
  const options = [];
  for (let mins = 0; mins <= 24 * 60; mins += 30) {
    options.push(mins);
  }

  for (const select of [els.startTime, els.endTime]) {
    select.innerHTML = '';
    options.forEach((mins) => {
      const opt = document.createElement('option');
      opt.value = mins;
      opt.textContent = minutesToLabel(mins);
      select.appendChild(opt);
    });
  }

  els.startTime.value = 10 * 60; // default 10:00 AM
  els.endTime.value = 13 * 60; // default 1:00 PM
}

async function loadNeighborhoods() {
  const res = await fetch('/api/neighborhoods');
  const data = await res.json();
  state.neighborhoods = data.neighborhoods || [];
  els.neighborhood.innerHTML = '<option value="">All neighborhoods</option>';
  state.neighborhoods.forEach((n) => {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    els.neighborhood.appendChild(opt);
  });
}

function populateCategories(events) {
  const categories = Array.from(new Set(events.map((e) => e.category).filter(Boolean))).sort();
  const current = els.category.value;
  els.category.innerHTML = '<option value="">All categories</option>';
  categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    els.category.appendChild(opt);
  });
  if (categories.includes(current)) els.category.value = current;
}

function currentTimeWindow() {
  const preset = els.preset.value;
  if (preset && PRESETS[preset]) return PRESETS[preset];
  if (preset === 'custom') {
    const start = parseInt(els.startTime.value, 10);
    const end = parseInt(els.endTime.value, 10);
    return { start, end };
  }
  return null;
}

function buildQuery() {
  const params = new URLSearchParams();
  if (els.borough.value) params.set('borough', els.borough.value);
  if (els.borough.value === 'Manhattan' && els.neighborhood.value) {
    params.set('neighborhood', els.neighborhood.value);
  }
  if (els.category.value) params.set('category', els.category.value);
  if (els.date.value) params.set('date', els.date.value);

  const window_ = currentTimeWindow();
  if (window_ && !Number.isNaN(window_.start) && !Number.isNaN(window_.end)) {
    params.set('startMin', window_.start);
    params.set('endMin', window_.end);
  }
  return params.toString();
}

function formatDateRange(ev) {
  if (!ev.startDate) return '';
  if (ev.endDate && ev.endDate !== ev.startDate) return `${ev.startDate} – ${ev.endDate}`;
  return ev.startDate;
}

function renderEvents(events) {
  els.list.innerHTML = '';

  if (!events.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No events match those filters. Try widening the time range or picking another neighborhood.';
    els.list.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  events.forEach((ev) => {
    const card = document.createElement('a');
    card.className = 'event-card';
    card.href = ev.url;
    card.target = '_blank';
    card.rel = 'noopener';

    const img = document.createElement('img');
    img.src = ev.imageSrc || '';
    img.alt = ev.name;
    img.loading = 'lazy';
    card.appendChild(img);

    const body = document.createElement('div');
    body.className = 'event-card-body';

    if (ev.category) {
      const cat = document.createElement('span');
      cat.className = 'event-category';
      cat.textContent = ev.category;
      body.appendChild(cat);
    }

    const title = document.createElement('h3');
    title.className = 'event-title';
    title.textContent = ev.name;
    body.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'event-meta';
    const locationBit = ev.neighborhood ? `${ev.neighborhood}, Manhattan` : ev.borough || ev.address || '';
    const timeBit = ev.startTime && ev.endTime ? `${ev.startTime}–${ev.endTime}` : '';
    meta.textContent = [formatDateRange(ev), timeBit, locationBit].filter(Boolean).join(' • ');
    body.appendChild(meta);

    if (ev.description) {
      const desc = document.createElement('p');
      desc.className = 'event-desc';
      desc.textContent = ev.description;
      body.appendChild(desc);
    }

    card.appendChild(body);
    frag.appendChild(card);
  });
  els.list.appendChild(frag);
}

async function loadEvents() {
  els.resultCount.textContent = 'Loading events…';
  const query = buildQuery();
  const res = await fetch(`/api/events${query ? `?${query}` : ''}`);
  const data = await res.json();

  els.resultCount.textContent = `${data.count} event${data.count === 1 ? '' : 's'} found`;
  els.lastUpdated.textContent = data.lastUpdated
    ? `Last updated ${new Date(data.lastUpdated).toLocaleString()}`
    : data.lastError
    ? `Scrape error: ${data.lastError}`
    : '';

  // Refresh category options from the *unfiltered-by-category* result set the
  // first time, so the dropdown always reflects what's actually out there.
  if (!els.category.dataset.populated) {
    populateCategories(data.events);
    els.category.dataset.populated = 'true';
  }

  renderEvents(data.events);
}

function updateNeighborhoodVisibility() {
  const isManhattan = els.borough.value === 'Manhattan';
  els.neighborhoodGroup.hidden = !isManhattan;
  if (!isManhattan) els.neighborhood.value = '';
}

function updateCustomTimeVisibility() {
  els.customGroup.hidden = els.preset.value !== 'custom';
}

function attachListeners() {
  els.borough.addEventListener('change', () => {
    updateNeighborhoodVisibility();
    loadEvents();
  });
  els.neighborhood.addEventListener('change', loadEvents);
  els.date.addEventListener('change', loadEvents);
  els.category.addEventListener('change', loadEvents);
  els.preset.addEventListener('change', () => {
    updateCustomTimeVisibility();
    loadEvents();
  });
  els.startTime.addEventListener('change', loadEvents);
  els.endTime.addEventListener('change', loadEvents);
  els.reset.addEventListener('click', () => {
    els.borough.value = '';
    els.neighborhood.value = '';
    els.date.value = '';
    els.preset.value = '';
    els.category.value = '';
    updateNeighborhoodVisibility();
    updateCustomTimeVisibility();
    loadEvents();
  });
}

async function init() {
  populateTimeDropdowns();
  updateNeighborhoodVisibility();
  updateCustomTimeVisibility();
  attachListeners();
  await loadNeighborhoods();
  await loadEvents();
}

init();
