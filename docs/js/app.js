/* sde.whtype.info — v007 */
(function () {
  const SITE_VERSION = '007';
  let wormholes = [];
  let meta = {};
  let currentWh = null;
  let focusedIndex = -1;

  const searchInput   = document.getElementById('search');
  const searchTyped   = document.getElementById('searchTyped');
  const searchHint    = document.getElementById('searchHint');
  const searchDisplay = document.getElementById('searchDisplay');
  const resultsEl     = document.getElementById('results');
  const statsEl       = document.getElementById('stats');
  const overlay       = document.getElementById('overlay');
  const metaEl        = document.getElementById('meta');
  const modalName     = document.getElementById('modalName');
  const modalAttrs    = document.getElementById('modalAttrs');
  const modeToggle    = document.getElementById('modeToggle');
  const lblRaw        = document.getElementById('lblRaw');
  const lblReadable   = document.getElementById('lblReadable');
  const searchWrapEl  = document.querySelector('.search-wrap');

  const SYSTEM_CLASS = {
    '-1': 'Pochven',
    1: 'Class 1',  2: 'Class 2',  3: 'Class 3',
    4: 'Class 4',  5: 'Class 5',  6: 'Class 6',
    7: 'HighSec',  8: 'LowSec',   9: 'NullSec',
    12: 'Thera',   13: 'Class 13',
    14: 'Sentinel MZ',       15: 'Liberated Barbican',
    16: 'Sanctified Vidette', 17: 'Conflux Eyrie',
    18: 'Azdaja Redoubt',    25: 'Pochven',
  };

  function fmtVal(key, val, readable) {
    if (val == null) return '—';
    if (!readable) return val;
    if (key === 'targetSystemClass') return SYSTEM_CLASS[val] ?? String(val);
    if (key === 'maxStableTime') {
      const h = val / 60;
      return (Number.isInteger(h) ? h : h.toFixed(1)) + 'h';
    }
    if (key === 'maxStableMass' || key === 'massRegeneration' || key === 'maxJumpMass') {
      return String(val).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' kg';
    }
    return val;
  }

  function render() {
    focusedIndex = -1;
    const q = searchInput.value.trim().toUpperCase();

    if (!q) {
      resultsEl.classList.remove('visible');
      resultsEl.innerHTML = '';
      statsEl.textContent = '';
      updateStatsPosition();
      return;
    }

    const filtered = wormholes.filter(w => w.name.toUpperCase().includes(q));

    if (filtered.length === 0) {
      resultsEl.classList.add('visible');
      resultsEl.innerHTML = '<div class="no-results">No matching wormhole types</div>';
      statsEl.textContent = '';
      updateStatsPosition();
      return;
    }

    resultsEl.classList.add('visible');
    resultsEl.innerHTML = filtered.map(w => `
      <div class="result-item" data-name="${w.name}">
        <span class="result-name">${w.name}</span>
        <span class="result-typeid">${w.typeID != null ? w.typeID : '—'}</span>
      </div>
    `).join('');
    statsEl.textContent = `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`;
    updateStatsPosition();

    resultsEl.querySelectorAll('.result-item').forEach(el => {
      el.addEventListener('click', () => {
        const wh = wormholes.find(w => w.name === el.dataset.name);
        if (wh) openModal(wh);
      });
    });
  }

  function setFocused(idx) {
    const items = resultsEl.querySelectorAll('.result-item');
    items.forEach((el, i) => el.classList.toggle('focused', i === idx));
    focusedIndex = idx;
    if (idx >= 0 && items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
  }

  // Float stats-line below the results dropdown without affecting layout
  function updateStatsPosition() {
    if (resultsEl.classList.contains('visible') && statsEl.textContent) {
      const wrapRect      = searchWrapEl.getBoundingClientRect();
      const resultsBottom = resultsEl.getBoundingClientRect().bottom;
      statsEl.style.top     = (resultsBottom - wrapRect.top + 4) + 'px';
      statsEl.style.display = 'block';
    } else {
      statsEl.style.display = 'none';
    }
  }

  function renderModal() {
    if (!currentWh) return;
    const readable = modeToggle.checked;
    modalName.textContent = currentWh.name;

    const rows = [
      ['',     'typeID',             currentWh.typeID],
      ['1381', 'targetSystemClass',  currentWh.targetSystemClass],
      ['1382', 'maxStableTime',      currentWh.maxStableTime],
      ['1383', 'maxStableMass',      currentWh.maxStableMass],
      ['1384', 'massRegeneration',   currentWh.massRegeneration],
      ['1385', 'maxJumpMass',        currentWh.maxJumpMass],
      ['1457', 'targetDistribution', currentWh.targetDistribution],
    ];

    modalAttrs.innerHTML = rows.map(([id, k, v]) => `
      <span class="attr-id">${id}</span>
      <span class="attr-key">${k}</span>
      <span class="attr-val">${fmtVal(k, v, readable)}</span>
    `).join('');
  }

  function openModal(wh) {
    currentWh = wh;
    renderModal();
    overlay.classList.add('open');
    searchInput.blur(); // dismiss mobile keyboard when modal opens
  }

  function closeModal() {
    overlay.classList.remove('open');
    setTimeout(() => searchInput.focus(), 50);
  }

  // Toggle mode
  function updateToggleLabels() {
    lblRaw.classList.toggle('active', !modeToggle.checked);
    lblReadable.classList.toggle('active', modeToggle.checked);
  }

  function onToggle() {
    updateToggleLabels();
    if (overlay.classList.contains('open')) renderModal();
  }

  modeToggle.addEventListener('change', onToggle);
  lblRaw.addEventListener('click', () => { modeToggle.checked = false; onToggle(); });
  lblReadable.addEventListener('click', () => { modeToggle.checked = true; onToggle(); });
  updateToggleLabels();

  function getNextCheckIn() {
    const now = new Date();
    let next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15, 0, 0, 0));
    for (let i = 0; i < 32; i++) {
      if (next > now && next.getUTCDate() % 2 === 1) break;
      next = new Date(next.getTime() + 24 * 60 * 60 * 1000);
      next.setUTCHours(14, 0, 0, 0);
    }
    const h = Math.floor((next - now) / 36e5);
    const m = Math.round(((next - now) % 36e5) / 60000);
    return h === 0 ? `${m}min` : m === 0 ? `${h}h` : `${h}h ${m}min`;
  }

  async function triggerSdeCheck() {
    resultsEl.classList.add('visible');
    resultsEl.innerHTML = '<div class="no-results">Checking SDE version...</div>';
    try {
      const res = await fetch('https://developers.eveonline.com/static-data/tranquility/latest.jsonl');
      const latest = JSON.parse(await res.text());
      if (latest.buildNumber > meta.sdeBuild) {
        resultsEl.innerHTML = `<div class="no-results" style="color:var(--highlight)">New build available: ${latest.buildNumber} &mdash; current: ${meta.sdeBuild}</div><div class="no-results" style="color:var(--text-mid);margin-top:0.25rem">Next auto-check in: ${getNextCheckIn()}</div>`;
      } else {
        resultsEl.innerHTML = `<div class="no-results" style="color:var(--accent)">Up to date &mdash; Build ${meta.sdeBuild}</div>`;
      }
    } catch {
      resultsEl.innerHTML = '<div class="no-results" style="color:#f85149">Check failed &mdash; try again later</div>';
    }
  }

  const aboutOverlay = document.getElementById('aboutOverlay');
  document.getElementById('aboutBtn').addEventListener('click', () => aboutOverlay.classList.add('open'));
  document.getElementById('aboutClose').addEventListener('click', () => aboutOverlay.classList.remove('open'));
  aboutOverlay.addEventListener('click', e => { if (e.target === aboutOverlay) aboutOverlay.classList.remove('open'); });

  document.getElementById('modalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (overlay.classList.contains('open')) {
        closeModal();
      } else if (aboutOverlay.classList.contains('open')) {
        aboutOverlay.classList.remove('open');
      } else {
        searchInput.value = '';
        searchTyped.textContent = '';
        searchHint.style.display = '';
        resultsEl.classList.remove('visible');
        resultsEl.innerHTML = '';
        updateStatsPosition();
      }
    }
    if (e.key === 'Enter' && !overlay.classList.contains('open')) {
      if (searchInput.value === 'vSDE') { triggerSdeCheck(); return; }
      const items = resultsEl.querySelectorAll('.result-item');
      const target = focusedIndex >= 0 ? items[focusedIndex]
                   : items.length === 1  ? items[0]
                   : null;
      if (target) {
        const wh = wormholes.find(w => w.name === target.dataset.name);
        if (wh) openModal(wh);
      }
    }
  });

  // Clicking anywhere in the search display (including brand) focuses the input
  // Guard: don't re-focus (and re-open keyboard) if a modal just opened
  searchDisplay.addEventListener('click', () => {
    if (!overlay.classList.contains('open')) searchInput.focus();
  });

  // Hide results when clicking outside the search area
  document.addEventListener('click', e => {
    if (!searchDisplay.contains(e.target)) {
      resultsEl.classList.remove('visible');
      resultsEl.innerHTML = '';
      updateStatsPosition();
    }
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!resultsEl.classList.contains('visible')) return;
      const items = resultsEl.querySelectorAll('.result-item');
      if (!items.length) return;
      const next = e.key === 'ArrowDown'
        ? Math.min(focusedIndex + 1, items.length - 1)
        : Math.max(focusedIndex - 1, -1);
      setFocused(next);
      return;
    }
    if (e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
    }
  });

  searchInput.addEventListener('focus', () => {
    if (searchInput.value) render();
  });

  searchInput.addEventListener('input', () => {
    searchTyped.textContent = searchInput.value;
    searchHint.style.display = searchInput.value ? 'none' : '';
    const len = searchInput.value.length;
    searchInput.setSelectionRange(len, len);
    render();
  });

  // Load data
  fetch('data/wormholes.json')
    .then(r => r.json())
    .then(data => {
      meta = data.meta;
      wormholes = data.wormholes;

      const dateFmt = { year: 'numeric', month: 'short', day: 'numeric' };
      const checkedDate = new Date(meta.generatedAt).toLocaleDateString('en-US', dateFmt);
      const buildDate = meta.sdeBuildDate
        ? ' (' + new Date(meta.sdeBuildDate).toLocaleDateString('en-US', dateFmt) + ')'
        : '';
      metaEl.innerHTML = `SDE Build ${meta.sdeBuild}${buildDate} · Last checked: ${checkedDate} · ${meta.count} types · Serving data from EVE Online <a href="https://developers.eveonline.com/docs/services/static-data/" target="_blank" rel="noopener">Static Data Export</a>`;
    })
    .catch(() => {
      statsEl.textContent = 'Failed to load wormhole data.';
    });
})();
