// ── CONFIG — defineret i js/auth.js ───────────────────────────

// ── STATE ─────────────────────────────────────────────────────
let aktivProjektId = new URLSearchParams(window.location.search).get('p') || '';
let projektType = 'kampdag'; // sættes ved load baseret på URL-parameter
let activeSubSlot = 0; // slot nummer for aktiv sub (0 = ingen)
let dropdowns = { holds: [], kommentatorer: [], lokationer: [] };

const makeKamp = () => ({
  hold1Lang: '', hold1Kort: '', hold1Score: 0,
  hold2Score: 0, hold2Kort: '', hold2Lang: '',
  kommentator: '', lokation: '', vmixcall: '', onAir: false,
  fixtureId: null, autoMode: false,
  enetpulseId: null,
  // edit buffer
  editMode: false, collapsed: false,
  buf: { hold1Lang: '', hold2Lang: '', kommentator: '', lokation: '', vmixcall: '', lokSomKomm: false }
});

let kampe = Array.from({ length: 6 }, makeKamp);

// ── TICKER STATE ──────────────────────────────────────────────
const makeTicker = () => ({
  overskrift: '', tekst: '', onAir: false, breaking: false,
  editMode: false, collapsed: false,
  buf: { overskrift: '', tekst: '' }
});
let tickers = Array.from({ length: 20 }, makeTicker);

// ── SUBS STATE ────────────────────────────────────────────────
const makeSub      = () => ({ navn: '', titel: '', editMode: false, buf: { navn: '', titel: '' } });
const makeVmixCall = () => ({ navn: '', titel: '', link: '', editMode: false, collapsed: false, buf: { navn: '', titel: '', link: '' } });
let subs      = Array.from({ length: 15 }, makeSub);
let vmixCalls = Array.from({ length: 8  }, makeVmixCall);

// ── CLOCK ─────────────────────────────────────────────────────
function tickClock() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('clock').textContent =
    `${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}
setInterval(tickClock, 1000);
tickClock();

// ── MUSIK ─────────────────────────────────────────────────────
const sange = ['sang1.mp3', 'sang2.mp3', 'sang3.mp3', 'sang4.mp3'];
const audio = new Audio();
let spillerNu = false;

function tilfældigSang() {
  return sange[Math.floor(Math.random() * sange.length)];
}

document.getElementById('playBtn').addEventListener('click', () => {
  if (spillerNu) {
    audio.pause();
    audio.currentTime = 0;
    spillerNu = false;
    document.getElementById('playBtn').textContent = '▶';
  } else {
    audio.src = tilfældigSang();
    audio.play();
    spillerNu = true;
    document.getElementById('playBtn').textContent = '⏹';
  }
});

audio.addEventListener('ended', () => {
  spillerNu = false;
  document.getElementById('playBtn').textContent = '▶';
});

// ── TABS ──────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'live') startLivePolling();
    else stopLivePolling();
  });
});

// ── SUPABASE HELPERS ──────────────────────────────────────────
// SB_HEADERS og sbHeaders() kommer fra js/auth.js
const SB_HEADERS = sbHeaders();
const SB_HEADERS_MINIMAL = { ...SB_HEADERS, 'Prefer': 'return=minimal' };

async function sbGet(path) {
  const res = await fetch(SB_URL + '/rest/v1/' + path, { headers: SB_HEADERS });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(SB_URL + '/rest/v1/' + path, {
    method: 'PATCH', headers: SB_HEADERS_MINIMAL, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

async function sbDelete(path) {
  const res = await fetch(SB_URL + '/rest/v1/' + path, {
    method: 'DELETE', headers: SB_HEADERS_MINIMAL
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

async function sbPost(path, body) {
  const res = await fetch(SB_URL + '/rest/v1/' + path, {
    method: 'POST', headers: SB_HEADERS_MINIMAL, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

// ── FETCH ALL DATA ────────────────────────────────────────────
async function fetchAll() {
  const pid = aktivProjektId;
  const [dropdownsRaw, kampeRaw, subsRaw, vmixCallsRaw, tickersRaw, settingsRaw, creditsRaw] =
    await Promise.all([
      sbGet('dropdowns?select=*&order=orden.asc'),
      sbGet('kampe?select=*&projekt_id=eq.' + pid + '&order=slot.asc'),
      sbGet('subs?select=*&projekt_id=eq.' + pid + '&order=slot.asc'),
      sbGet('vmix_calls?select=*&projekt_id=eq.' + pid + '&order=slot.asc'),
      sbGet('tickers?select=*&projekt_id=eq.' + pid + '&order=slot.asc'),
      sbGet('settings?select=*&projekt_id=eq.' + pid),
      sbGet('credits?select=*&projekt_id=eq.' + pid)
    ]);

  const speedRow     = settingsRaw.find(r => r.key === 'credits_speed');
  const speed        = speedRow ? parseFloat(speedRow.value) : 30;
  const activeSubRow = settingsRaw.find(r => r.key === 'active_sub');
  activeSubSlot      = activeSubRow ? parseInt(activeSubRow.value) || 0 : 0;

  return {
    dropdowns: {
      kommentatorer: dropdownsRaw.filter(r => r.type === 'kommentator').map(r => ({ lang: r.lang, titel: r.titel || '' })).sort((a, b) => a.lang.localeCompare(b.lang, 'da')),
      lokationer:    dropdownsRaw.filter(r => r.type === 'lokation').map(r => r.lang).sort((a, b) => a.localeCompare(b, 'da')),
      holds:         dropdownsRaw.filter(r => r.type === 'hold').map(r => ({ lang: r.lang, kort: r.kort, enetNavn: r.enet_navn || null })).sort((a, b) => a.lang.localeCompare(b.lang, 'da'))
    },
    kampe: kampeRaw.map(r => ({
      hold1Lang:   r.hold1_lang   || '',
      hold1Kort:   r.hold1_kort   || '',
      hold1Score:  r.hold1_score  || 0,
      hold2Score:  r.hold2_score  || 0,
      hold2Kort:   r.hold2_kort   || '',
      hold2Lang:   r.hold2_lang   || '',
      kommentator: r.kommentator  || '',
      lokation:    r.lokation     || '',
      vmixcall:    r.vmixcall     || '',
      onAir:       r.on_air       || false,
      fixtureId:   r.fixture_id   || null,
      autoMode:    r.auto_mode    || false,
      enetpulseId: r.enetpulse_id || null
    })),
    subs: {
      subs:      subsRaw.map(r => ({ navn: r.navn || '', titel: r.titel || '' })),
      vmixCalls: vmixCallsRaw.map(r => ({ navn: r.navn || '', titel: r.titel || '', link: r.link || '' }))
    },
    tickers: tickersRaw.map(r => ({
      overskrift: r.overskrift || '',
      tekst:      r.tekst      || '',
      onAir:      r.on_air     || false,
      breaking:   r.breaking   || false
    })),
    credits: {
      items: creditsRaw.map(r => ({
        row:    r.id,
        side:   r.side,
        orden:  r.orden,
        titel:  r.titel || '',
        navne:  r.navne || ''
      })),
      speed
    }
  };
}

// ── TOAST ─────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── CLIPBOARD ─────────────────────────────────────────────────
async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopieret!', 'ok');
  } catch {
    toast('Kopiering fejlede', 'err');
  }
}

// ── FLASH SAVED ───────────────────────────────────────────────
function flashSaved(el, color = 'blue') {
  if (!el) return;
  const cls = 'flash-saved-' + color;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

// ── TITLE CASE ────────────────────────────────────────────────
function toTitleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}
function titleCaseInput(el, buf, key) {
  el.addEventListener('blur', () => {
    const val = toTitleCase(el.value);
    el.value  = val;
    buf[key]  = val;
  });
}

// ── STAMDATA ──────────────────────────────────────────────────
let stamdataRaw = [];


function renderStamdataSection(type, listId, mapper) {
  const list = document.getElementById(listId);
  if (!list) return;
  const items = stamdataRaw.filter(r => r.type === type).map(mapper).sort((a, b) => a.label.localeCompare(b.label, 'da'));
  if (items.length === 0) {
    list.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:#444;">—</div>';
    return;
  }
  list.innerHTML = '';
  items.forEach(item => {
    list.appendChild(makeStamdataRow(item));
  });
}

function makeStamdataRow(item) {
  const hasKort     = item.kort     !== null;
  const hasApiNavn  = item.apiNavn  !== null;
  const hasEnetNavn = item.enetNavn !== null;
  const hasTitel    = item.titel    != null;
  const row = document.createElement('div');
  row.className = 'stamdata-item';
  row.dataset.id = item.id;

  function showView() {
    row.innerHTML = `
      <span class="stamdata-item-name">${esc(item.label)}</span>
      ${hasKort     ? `<span class="stamdata-item-kort">${esc(item.kort)}</span>` : ''}
      ${hasTitel    ? `<span class="stamdata-item-alias">${item.titel ? esc(item.titel) : '<span style="color:#333">ingen titel</span>'}</span>` : ''}
      ${hasApiNavn  ? `<span class="stamdata-item-alias" title="API-Football navn">${item.apiNavn  ? esc(item.apiNavn)  : '<span style="color:#333">ingen AFL-alias</span>'}</span>` : ''}
      ${hasEnetNavn ? `<span class="stamdata-item-alias" title="Enetpulse navn">${item.enetNavn ? esc(item.enetNavn) : '<span style="color:#333">ingen enet-alias</span>'}</span>` : ''}
      <button class="stamdata-edit" title="Redigér">✎</button>
      <button class="stamdata-del"  title="Fjern">✕</button>
    `;
    row.querySelector('.stamdata-edit').addEventListener('click', showEdit);
    row.querySelector('.stamdata-del').addEventListener('click', () => deleteStamdataItem(item.id));
  }

  function showEdit() {
    row.innerHTML = `
      <input class="stamdata-input sd-edit-lang"  value="${esc(item.label)}"    placeholder="Dansk navn"       style="flex:2;">
      ${hasKort     ? `<input class="stamdata-input sd-edit-kort"  value="${esc(item.kort)}"     placeholder="Kort"             style="flex:1;max-width:80px;">` : ''}
      ${hasTitel    ? `<input class="stamdata-input sd-edit-titel" value="${esc(item.titel)}"    placeholder="Titel"            style="flex:2;">` : ''}
      ${hasApiNavn  ? `<input class="stamdata-input sd-edit-api"   value="${esc(item.apiNavn)}"  placeholder="API-Football navn" style="flex:2;">` : ''}
      ${hasEnetNavn ? `<input class="stamdata-input sd-edit-enet"  value="${esc(item.enetNavn)}" placeholder="Enetpulse navn"   style="flex:2;">` : ''}
      <button class="stamdata-btn sd-save">Gem</button>
      <button class="stamdata-del sd-cancel" title="Annuller">✕</button>
    `;
    const langInput  = row.querySelector('.sd-edit-lang');
    const kortInput  = row.querySelector('.sd-edit-kort');
    const titelInput = row.querySelector('.sd-edit-titel');
    const apiInput   = row.querySelector('.sd-edit-api');
    const enetInput  = row.querySelector('.sd-edit-enet');
    langInput.focus();

    row.querySelector('.sd-save').addEventListener('click', async () => {
      const newLang     = langInput.value.trim();
      const newKort     = kortInput  ? kortInput.value.trim()  : null;
      const newTitel    = titelInput ? titelInput.value.trim() : null;
      const newApiNavn  = apiInput   ? apiInput.value.trim()   : null;
      const newEnetNavn = enetInput  ? enetInput.value.trim()  : null;
      if (!newLang) return;
      row.querySelector('.sd-save').disabled = true;
      const body = { lang: newLang };
      if (newKort     !== null) body.kort     = newKort;
      if (newTitel    !== null) body.titel    = newTitel;
      if (newApiNavn  !== null) body.api_navn  = newApiNavn  || null;
      if (newEnetNavn !== null) body.enet_navn = newEnetNavn || null;
      await sbPatch('dropdowns?id=eq.' + item.id, body);
      item.label   = newLang;
      if (newKort     !== null) item.kort     = newKort;
      if (newTitel    !== null) item.titel    = newTitel;
      if (newApiNavn  !== null) item.apiNavn  = newApiNavn;
      if (newEnetNavn !== null) item.enetNavn = newEnetNavn;
      await refreshDropdowns();
    });

    row.querySelector('.sd-cancel').addEventListener('click', showView);

    const inputs = [langInput, kortInput, titelInput, apiInput, enetInput].filter(Boolean);
    inputs.forEach((inp, idx) => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const next = inputs[idx + 1];
          if (next) next.focus();
          else row.querySelector('.sd-save').click();
        }
        if (e.key === 'Escape') showView();
      });
    });
  }

  showView();
  return row;
}

async function deleteStamdataItem(id) {
  await sbDelete('dropdowns?id=eq.' + id);
  await refreshDropdowns();
}

async function addStamdataItem(type, lang, kort, apiNavn = null, titel = null, enetNavn = null) {
  if (!lang.trim()) return;
  const orden = stamdataRaw.filter(r => r.type === type).length + 1;
  const body = { type, lang: lang.trim(), orden };
  if (kort !== null) body.kort = kort.trim();
  if (apiNavn)  body.api_navn  = apiNavn;
  if (enetNavn) body.enet_navn = enetNavn;
  if (titel !== null) body.titel = titel.trim();
  await sbPost('dropdowns', body);
  await refreshDropdowns();
}

async function refreshDropdowns() {
  const rows = await sbGet('dropdowns?select=*&order=orden.asc');
  stamdataRaw = rows;
  dropdowns = {
    kommentatorer: rows.filter(r => r.type === 'kommentator').map(r => ({ lang: r.lang, titel: r.titel || '' })).sort((a, b) => a.lang.localeCompare(b.lang, 'da')),
    lokationer:    rows.filter(r => r.type === 'lokation').map(r => r.lang).sort((a, b) => a.localeCompare(b, 'da')),
    holds:         rows.filter(r => r.type === 'hold').map(r => ({ lang: r.lang, kort: r.kort, enetNavn: r.enet_navn || null })).sort((a, b) => a.lang.localeCompare(b.lang, 'da'))
  };
  renderStamdataSection('kommentator', 'sdKommList', r => ({ label: r.lang, kort: null, titel: r.titel ?? '', apiNavn: null, id: r.id }));
  renderStamdataSection('hold',        'sdHoldList', r => ({ label: r.lang, kort: r.kort, apiNavn: r.api_navn || '', enetNavn: r.enet_navn || '', id: r.id }));
  renderStamdataSection('lokation',    'sdLokList',  r => ({ label: r.lang, kort: null, apiNavn: null, id: r.id }));
}

function initStamdata() {
  const sdKommBtn  = document.getElementById('sdKommBtn');
  const sdHoldBtn  = document.getElementById('sdHoldBtn');
  const sdLokBtn   = document.getElementById('sdLokBtn');

  sdKommBtn.addEventListener('click', async () => {
    const input      = document.getElementById('sdKommInput');
    const titelInput = document.getElementById('sdKommTitelInput');
    sdKommBtn.disabled = true;
    await addStamdataItem('kommentator', input.value, null, null, titelInput.value.trim() || null);
    input.value = ''; titelInput.value = '';
    sdKommBtn.disabled = false;
    input.focus();
  });
  document.getElementById('sdKommInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('sdKommTitelInput').focus();
  });
  document.getElementById('sdKommTitelInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') sdKommBtn.click();
  });

  sdHoldBtn.addEventListener('click', async () => {
    const lang = document.getElementById('sdHoldLangInput');
    const kort = document.getElementById('sdHoldKortInput');
    const api  = document.getElementById('sdHoldApiInput');
    const enet = document.getElementById('sdHoldEnetInput');
    if (!lang.value.trim()) return;
    sdHoldBtn.disabled = true;
    await addStamdataItem('hold', lang.value, kort.value, api.value.trim() || null, null, enet.value.trim() || null);
    lang.value = ''; kort.value = ''; api.value = ''; enet.value = '';
    sdHoldBtn.disabled = false;
    lang.focus();
  });
  document.getElementById('sdHoldLangInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('sdHoldKortInput').focus();
  });
  document.getElementById('sdHoldKortInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('sdHoldApiInput').focus();
  });
  document.getElementById('sdHoldApiInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('sdHoldEnetInput').focus();
  });
  document.getElementById('sdHoldEnetInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') sdHoldBtn.click();
  });

  sdLokBtn.addEventListener('click', async () => {
    const input = document.getElementById('sdLokInput');
    sdLokBtn.disabled = true;
    await addStamdataItem('lokation', input.value, null);
    input.value = '';
    sdLokBtn.disabled = false;
    input.focus();
  });
  document.getElementById('sdLokInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') sdLokBtn.click();
  });
}

// ── HTML ESCAPE ───────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── RENDER ────────────────────────────────────────────────────
function renderAll() {
  const list = document.getElementById('kampList');
  list.innerHTML = '';
  kampe.forEach((_, i) => list.appendChild(buildBlock(i)));
}

function rerender(i) {
  const old = document.getElementById('kamp-' + i);
  if (old) old.replaceWith(buildBlock(i));
}

function buildBlock(i) {
  const k = kampe[i];
  const block = document.createElement('div');
  block.id        = 'kamp-' + i;
  block.className = 'kamp-block'
    + (k.onAir     ? ' on-air'    : '')
    + (k.collapsed ? ' collapsed' : '');

  // Header
  block.innerHTML = `
    <div class="kamp-header" id="kamp-hdr-${i}">
      <div class="kamp-header-left">
        <button class="on-air-btn ${k.onAir ? 'active' : ''}"
                id="oabtn-${i}" ${!kampKlarTilOnAir(i) ? 'disabled' : ''}>ON AIR</button>
      </div>
      <div class="kamp-header-center">
        <span class="kamp-label">KAMP ${i + 1}</span>
      </div>
      <div class="kamp-header-right">
        ${i === 5 ? `<button class="auto-mode-btn ${k.autoMode ? 'active' : ''}" id="autobtn-${i}">${k.autoMode ? '⚡ AUTO' : 'MANUEL'}</button>` : ''}
        ${!k.editMode
          ? `<button class="icon-btn" id="editbtn-${i}" title="Rediger">✏️</button>`
          : ''}
        <button class="icon-btn" id="collbtn-${i}" title="Fold ind/ud">
          <i class="collapse-arrow">▴</i>
        </button>
      </div>
    </div>
    <div class="kamp-body" id="kamp-body-${i}"></div>
  `;

  // Body content
  const body = block.querySelector('#kamp-body-' + i);
  body.appendChild(k.editMode ? buildEditView(i) : buildNormalView(i));

  // Events — ON AIR
  block.querySelector('#oabtn-' + i).addEventListener('click', e => {
    e.stopPropagation();
    toggleOnAir(i);
  });

  // Events — collapse (click header, but not buttons)
  block.querySelector('#kamp-hdr-' + i).addEventListener('click', e => {
    if (!e.target.closest('button')) toggleCollapse(i);
  });
  block.querySelector('#collbtn-' + i).addEventListener('click', e => {
    e.stopPropagation();
    toggleCollapse(i);
  });

  // Events — edit button (normal mode only)
  const eb = block.querySelector('#editbtn-' + i);
  if (eb) eb.addEventListener('click', e => { e.stopPropagation(); enterEdit(i); });

  // Events — auto mode toggle (slot 6 only)
  const ab = block.querySelector('#autobtn-' + i);
  if (ab) ab.addEventListener('click', e => { e.stopPropagation(); toggleAutoMode(i); });

  return block;
}

// ── NORMAL VIEW ───────────────────────────────────────────────
function buildNormalView(i) {
  const k   = kampe[i];
  const div = document.createElement('div');
  div.className = 'normal-view';

  div.innerHTML = `
    <div class="kamp-info">
      <div class="info-row">
        <span class="info-icon">🎙</span>
        <span>${esc(k.kommentator) || '<span style="color:#444">—</span>'}</span>
      </div>
      <div class="info-row">
        <span class="info-icon">📍</span>
        <span>${esc(k.lokation) || '<span style="color:#444">—</span>'}</span>
      </div>
      <div class="info-row">
        <span class="info-icon">🔗</span>
        <span class="info-link-text" title="${esc(k.vmixcall)}">${esc(k.vmixcall) || '<span style="color:#444">—</span>'}</span>
        <button class="copy-btn" id="cpnorm-${i}" title="Kopiér link">⎘</button>
      </div>
    </div>
    <div class="score-area">
      <div class="team-block">
        <div class="team-name">${esc(k.hold1Kort) || '—'}</div>
        <div class="score-row">
          <button class="score-btn" id="s1m-${i}">−</button>
          <div class="score-val" id="sv1-${i}">${k.hold1Score}</div>
          <button class="score-btn" id="s1p-${i}">+</button>
        </div>
      </div>
      <div class="vs-sep">VS</div>
      <div class="team-block">
        <div class="team-name">${esc(k.hold2Kort) || '—'}</div>
        <div class="score-row">
          <button class="score-btn" id="s2m-${i}">−</button>
          <div class="score-val" id="sv2-${i}">${k.hold2Score}</div>
          <button class="score-btn" id="s2p-${i}">+</button>
        </div>
      </div>
    </div>
    <div></div>
  `;

  div.querySelector('#cpnorm-' + i).addEventListener('click', () => copyText(k.vmixcall));
  div.querySelector('#s1m-' + i).addEventListener('click', () => changeScore(i, 1, -1));
  div.querySelector('#s1p-' + i).addEventListener('click', () => changeScore(i, 1, +1));
  div.querySelector('#s2m-' + i).addEventListener('click', () => changeScore(i, 2, -1));
  div.querySelector('#s2p-' + i).addEventListener('click', () => changeScore(i, 2, +1));

  return div;
}

// ── EDIT VIEW ─────────────────────────────────────────────────
function buildEditView(i) {
  const k   = kampe[i];
  const buf = k.buf;
  const div = document.createElement('div');

  const holdOpts = (selectedLang) => dropdowns.holds.map(h =>
    `<option value="${esc(h.lang)}" ${buf[selectedLang] === h.lang ? 'selected' : ''}>${esc(h.lang)}</option>`
  ).join('');

  const kommOpts = dropdowns.kommentatorer.map(v =>
    `<option value="${esc(v.lang)}" ${buf.kommentator === v.lang ? 'selected' : ''}>${esc(v.lang)}</option>`
  ).join('');

  const lokOpts = dropdowns.lokationer.map(v =>
    `<option value="${esc(v)}" ${!buf.lokSomKomm && buf.lokation === v ? 'selected' : ''}>${esc(v)}</option>`
  ).join('');

  const today = new Date().toISOString().split('T')[0];

  const holdFields = i === 5 && k.autoMode ? `
      <div class="form-group span2">
        <label class="form-label">Hent fra Enetpulse</label>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <input class="form-input" type="date" id="enetdate-${i}" value="${today}" style="width:160px;color-scheme:dark;">
          <button class="btn btn-save" id="enetbtn-${i}" style="white-space:nowrap;">VIS KAMPE</button>
        </div>
        <div id="enetresults-${i}"></div>
        ${k.enetpulseId ? `<div style="margin-top:4px;font-size:11px;color:#555;">Aktiv: <span style="color:var(--orange)">${esc(k.hold1Lang)} vs ${esc(k.hold2Lang)}</span></div>` : ''}
      </div>` : `
      <div class="form-group">
        <label class="form-label">Hold 1</label>
        <select class="form-select" id="eh1-${i}">
          <option value="">— Vælg hold —</option>
          ${holdOpts('hold1Lang')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Hold 2</label>
        <select class="form-select" id="eh2-${i}">
          <option value="">— Vælg hold —</option>
          ${holdOpts('hold2Lang')}
        </select>
      </div>
      <div class="form-group span2">
        <label class="form-label">Hent fra Enetpulse</label>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <input class="form-input" type="date" id="enetdate-${i}" value="${today}" style="width:160px;color-scheme:dark;">
          <button class="btn btn-save" id="enetbtn-${i}" style="white-space:nowrap;">VIS KAMPE</button>
        </div>
        <div id="enetresults-${i}"></div>
        ${k.enetpulseId ? `<div style="margin-top:4px;font-size:11px;color:#555;">Aktiv: <span style="color:var(--orange)">${esc(k.hold1Lang)} vs ${esc(k.hold2Lang)}</span></div>` : ''}
      </div>`;

  div.innerHTML = `
    <div class="edit-grid">
      ${holdFields}
      <div class="form-group">
        <label class="form-label">Kommentator</label>
        <select class="form-select" id="ek-${i}">
          <option value="">— Vælg kommentator —</option>
          ${kommOpts}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Lokation</label>
        <select class="form-select" id="el-${i}">
          <option value="">— Vælg lokation —</option>
          <option value="__kommentator__" ${buf.lokSomKomm ? 'selected' : ''}>Samme som kommentator</option>
          ${lokOpts}
        </select>
      </div>
      <div class="form-group span2">
        <label class="form-label">vMix Call Link</label>
        <div class="vmix-row">
          <input class="form-input" type="text" id="ev-${i}"
            value="${esc(buf.vmixcall)}" placeholder="https://…">
          <button class="copy-btn icon-btn" id="cpedit-${i}" title="Kopiér link">⎘</button>
        </div>
      </div>
    </div>
    <div class="edit-actions">
      <button class="btn btn-save"   id="gem-${i}">💾 GEM</button>
      <button class="btn btn-cancel" id="ann-${i}">ANNULLER</button>
      <button class="btn btn-reset"  id="nul-${i}">NULSTIL</button>
    </div>
  `;

  // Live-update buffer on change
  if (!(i === 5 && k.autoMode)) {
    div.querySelector('#eh1-' + i).addEventListener('change', e => { buf.hold1Lang = e.target.value; });
    div.querySelector('#eh2-' + i).addEventListener('change', e => { buf.hold2Lang = e.target.value; });

    const enetBtn = div.querySelector('#enetbtn-' + i);
    enetBtn.addEventListener('click', () => {
      const date = div.querySelector('#enetdate-' + i).value;
      if (date) searchEnetpulseByDate(i, div, date);
    });
    div.querySelector('#enetdate-' + i).addEventListener('keydown', e => {
      if (e.key === 'Enter') enetBtn.click();
    });
  } else {
    const enetBtn6 = div.querySelector('#enetbtn-' + i);
    enetBtn6.addEventListener('click', () => {
      const date = div.querySelector('#enetdate-' + i).value;
      if (date) searchEnetpulseByDate(i, div, date);
    });
    div.querySelector('#enetdate-' + i).addEventListener('keydown', e => {
      if (e.key === 'Enter') enetBtn6.click();
    });
  }
  div.querySelector('#ek-'  + i).addEventListener('change', e => { buf.kommentator = e.target.value; });
  div.querySelector('#el-'  + i).addEventListener('change', e => {
    if (e.target.value === '__kommentator__') {
      buf.lokSomKomm = true;
    } else {
      buf.lokSomKomm = false;
      buf.lokation = e.target.value;
    }
  });
  div.querySelector('#ev-'  + i).addEventListener('input',  e => { buf.vmixcall = e.target.value; });

  div.querySelector('#cpedit-' + i).addEventListener('click', () =>
    copyText(div.querySelector('#ev-' + i).value));

  div.querySelector('#gem-' + i).addEventListener('click', () => saveKamp(i, div));
  div.querySelector('#ann-' + i).addEventListener('click', () => cancelEdit(i));
  div.querySelector('#nul-' + i).addEventListener('click', () => resetEdit(i, div));

  return div;
}

// ── ACTIONS ───────────────────────────────────────────────────

function kampKlarTilOnAir(i) {
  const k = kampe[i];
  return !!(k.hold1Lang && k.hold2Lang && k.kommentator);
}

function tickerKlarTilOnAir(i) {
  const t = tickers[i];
  return t.overskrift && t.tekst;
}

function toggleCollapse(i) {
  kampe[i].collapsed = !kampe[i].collapsed;
  rerender(i);
}

function toggleOnAir(i) {
  if (!kampe[i].onAir && !kampKlarTilOnAir(i)) return;
  kampe[i].onAir = !kampe[i].onAir;
  kampe[i].onAirPending = true;
  rerender(i);
  sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { on_air: kampe[i].onAir })
    .then(() => { kampe[i].onAirPending = false; })
    .catch(() => { kampe[i].onAirPending = false; toast('Fejl ved ON AIR opdatering', 'err'); });
}

function enterEdit(i) {
  const k = kampe[i];
  k.buf = {
    hold1Lang:   k.hold1Lang,
    hold2Lang:   k.hold2Lang,
    kommentator: k.kommentator,
    lokation:    k.lokation,
    vmixcall:    k.vmixcall,
    lokSomKomm:  false
  };
  k.editMode = true;
  rerender(i);
}

function cancelEdit(i) {
  kampe[i].editMode = false;
  rerender(i);
}

async function toggleAutoMode(i) {
  const k = kampe[i];
  const newMode = !k.autoMode;
  try {
    await sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { auto_mode: newMode });
    k.autoMode = newMode;
    if (newMode) {
      k.buf = { hold1Lang: k.hold1Lang, hold2Lang: k.hold2Lang, kommentator: k.kommentator, lokation: k.lokation, vmixcall: k.vmixcall, lokSomKomm: false };
      k.editMode = true;
    }
    rerender(i);
  } catch { toast('Fejl ved skift af tilstand', 'err'); }
}

async function searchFixtureByDate(i, div, date) {
  const resultsEl = div.querySelector('#efixresults-' + i);
  resultsEl.innerHTML = '<span style="color:#555;font-size:12px;">Henter kampe…</span>';
  try {
    const res = await fetch('/api/fixture-search?date=' + encodeURIComponent(date));
    const data = await res.json();
    if (!data.fixtures || data.fixtures.length === 0) {
      resultsEl.innerHTML = '<span style="color:#555;font-size:12px;">Ingen kampe den dag</span>';
      return;
    }
    resultsEl.innerHTML = '';
    data.fixtures.forEach(f => {
      const el = document.createElement('div');
      el.className = 'fixture-result-item';
      el.innerHTML = `
        <div class="fix-teams">${esc(f.home)} vs ${esc(f.away)}</div>
        <div class="fix-meta">${esc(f.league)} · ${esc(f.date)}</div>`;
      el.addEventListener('click', async () => {
        try {
          await sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), {
            fixture_id: f.id,
            hold1_lang: f.home,
            hold1_kort: f.home_kort || f.home,
            hold2_lang: f.away,
            hold2_kort: f.away_kort || f.away
          });
          kampe[i].fixtureId = f.id;
          kampe[i].hold1Lang = f.home;
          kampe[i].hold1Kort = f.home_kort || f.home;
          kampe[i].hold2Lang = f.away;
          kampe[i].hold2Kort = f.away_kort || f.away;
          toast('Kamp valgt ✓', 'ok');
          rerender(i);
        } catch { toast('Fejl ved gem af fixture', 'err'); }
      });
      resultsEl.appendChild(el);
    });
  } catch { resultsEl.innerHTML = '<span style="color:var(--red);font-size:12px;">Hentning fejlede</span>'; }
}

async function searchEnetpulseByDate(i, div, date) {
  const resultsEl = div.querySelector('#enetresults-' + i);
  resultsEl.innerHTML = '<span style="color:#555;font-size:12px;">Henter kampe…</span>';
  try {
    const res  = await fetch('/api/enetpulse?date=' + encodeURIComponent(date));
    const data = await res.json();
    if (data.error) { resultsEl.innerHTML = `<span style="color:var(--red);font-size:12px;">${esc(data.error)}</span>`; return; }
    const fixtures = data.fixtures || [];
    if (!fixtures.length) {
      resultsEl.innerHTML = '<span style="color:#555;font-size:12px;">Ingen kampe den dag</span>';
      return;
    }
    resultsEl.innerHTML = '';
    fixtures.forEach(f => {
      const el = document.createElement('div');
      el.className = 'fixture-result-item';
      el.innerHTML = `
        <div class="fix-teams">${esc(f.home_enet || '?')} vs ${esc(f.away_enet || '?')}</div>
        <div class="fix-meta">${esc(f.tournament)} · ${esc(f.starttime)}</div>`;
      el.addEventListener('click', () => selectEnetpulseFixture(i, f));
      resultsEl.appendChild(el);
    });
  } catch { resultsEl.innerHTML = '<span style="color:var(--red);font-size:12px;">Hentning fejlede</span>'; }
}

async function selectEnetpulseFixture(i, f) {
  const h1drop = dropdowns.holds.find(h => h.enetNavn && h.enetNavn === f.home_enet);
  const h2drop = dropdowns.holds.find(h => h.enetNavn && h.enetNavn === f.away_enet);
  const h1 = h1drop
    ? { lang: h1drop.lang, kort: h1drop.kort }
    : { lang: f.home_enet, kort: f.home_enet.substring(0, 3).toUpperCase() };
  const h2 = h2drop
    ? { lang: h2drop.lang, kort: h2drop.kort }
    : { lang: f.away_enet, kort: f.away_enet.substring(0, 3).toUpperCase() };

  kampe[i].enetpulseId  = f.id;
  kampe[i].hold1Lang    = h1.lang;
  kampe[i].hold1Kort    = h1.kort;
  kampe[i].hold2Lang    = h2.lang;
  kampe[i].hold2Kort    = h2.kort;
  kampe[i].buf.hold1Lang = h1.lang;
  kampe[i].buf.hold2Lang = h2.lang;

  try {
    await sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), {
      enetpulse_id: f.id,
      hold1_lang:   h1.lang,
      hold1_kort:   h1.kort,
      hold2_lang:   h2.lang,
      hold2_kort:   h2.kort
    });
    toast('Kamp valgt ✓', 'ok');
    rerender(i);
  } catch { toast('Fejl ved gem af enetpulse kamp', 'err'); }
}

function resetEdit(i, div) {
  // Clear dropdowns and score — keep vmixcall
  const k = kampe[i];
  k.buf.hold1Lang   = '';
  k.buf.hold2Lang   = '';
  k.buf.kommentator = '';
  k.buf.lokation    = '';
  k.buf.lokSomKomm  = false;
  k.hold1Score      = 0;
  k.hold2Score      = 0;

  div.querySelector('#eh1-' + i).value = '';
  div.querySelector('#eh2-' + i).value = '';
  div.querySelector('#ek-'  + i).value = '';
  div.querySelector('#el-'  + i).value = '';
}

async function saveKamp(i, div) {
  const k   = kampe[i];
  const buf = k.buf;

  // Resolve short names — spring over i AUTO mode (holdnavne sættes via fixture-søgning)
  if (!k.autoMode) {
    const h1 = dropdowns.holds.find(h => h.lang === buf.hold1Lang);
    const h2 = dropdowns.holds.find(h => h.lang === buf.hold2Lang);
    k.hold1Lang = buf.hold1Lang;
    k.hold1Kort = h1 ? h1.kort : buf.hold1Lang;
    k.hold2Lang = buf.hold2Lang;
    k.hold2Kort = h2 ? h2.kort : buf.hold2Lang;
  }
  k.kommentator = buf.kommentator;
  k.lokation    = buf.lokSomKomm ? buf.kommentator : buf.lokation;
  k.vmixcall    = buf.vmixcall;
  k.editMode    = false;

  rerender(i);
  if (i < 6) rerenderVmixCall(i); // Lås/frigiv sub slot øjeblikkeligt

  kampe[i].savePending = true;
  try {
    await sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), {
      hold1_lang:   k.hold1Lang,
      hold1_kort:   k.hold1Kort,
      hold1_score:  k.hold1Score,
      hold2_score:  k.hold2Score,
      hold2_kort:   k.hold2Kort,
      hold2_lang:   k.hold2Lang,
      kommentator:  k.kommentator,
      lokation:     k.lokation,
      vmixcall:     k.vmixcall
    });
    toast('Gemt ✓', 'ok');
    // Synk link + kommentator navn/titel til vmix_calls slot
    if (i < 6 && vmixCalls[i]) {
      const kommEntry = dropdowns.kommentatorer.find(d => d.lang === k.kommentator);
      const kommNavn  = k.kommentator;
      const kommTitel = kommEntry ? kommEntry.titel : '';
      vmixCalls[i].link      = k.vmixcall;
      vmixCalls[i].buf.link  = k.vmixcall;
      vmixCalls[i].navn      = kommNavn;
      vmixCalls[i].buf.navn  = kommNavn;
      vmixCalls[i].titel     = kommTitel;
      vmixCalls[i].buf.titel = kommTitel;
      await sbPatch('vmix_calls?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { link: k.vmixcall, navn: kommNavn, titel: kommTitel });
      rerenderVmixCall(i);
    }
  } catch {
    toast('Fejl ved gem — prøv igen', 'err');
  } finally {
    kampe[i].savePending = false;
  }
}

async function changeScore(i, team, delta) {
  const k = kampe[i];
  if (team === 1) {
    k.hold1Score = Math.max(0, k.hold1Score + delta);
    const el = document.getElementById('sv1-' + i);
    if (el) el.textContent = k.hold1Score;
  } else {
    k.hold2Score = Math.max(0, k.hold2Score + delta);
    const el = document.getElementById('sv2-' + i);
    if (el) el.textContent = k.hold2Score;
  }
  try {
    const body = team === 1
      ? { hold1_score: kampe[i].hold1Score }
      : { hold2_score: kampe[i].hold2Score };
    await sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), body);
  } catch {
    toast('Fejl ved scoreopdatering', 'err');
  }
}

// ── TICKER RENDER ─────────────────────────────────────────────
function renderTickers() {
  const list = document.getElementById('tickerList');
  if (!list) return;
  list.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'ticker-list';
  tickers.forEach((_, i) => wrap.appendChild(buildTickerBlock(i)));
  list.appendChild(wrap);
}

function rerenderTicker(i) {
  const old = document.getElementById('ticker-' + i);
  if (old) old.replaceWith(buildTickerBlock(i));
}

function buildTickerBlock(i) {
  const t = tickers[i];
  const block = document.createElement('div');
  block.id = 'ticker-' + i;
  block.className = 'ticker-block'
    + (t.onAir && t.breaking ? ' on-air-breaking' : '')
    + (t.onAir && !t.breaking ? ' on-air' : '')
    + (t.collapsed ? ' collapsed' : '');

  block.innerHTML = `
    <div class="ticker-header" id="ticker-hdr-${i}">
      <div class="ticker-header-left">
        <button class="on-air-btn ${t.onAir ? 'active' : ''}" id="toa-${i}" ${!tickerKlarTilOnAir(i) ? 'disabled' : ''}>ON AIR</button>
        <button class="breaking-btn ${t.breaking ? 'active' : ''}" id="tbr-${i}" ${!tickerKlarTilOnAir(i) ? 'disabled' : ''}>BREAKING</button>
      </div>
      <div class="ticker-header-center">
        <span class="ticker-num">TICKER ${i + 1}</span>
      </div>
      <div class="ticker-header-right">
        ${!t.editMode ? `<button class="icon-btn" id="teb-${i}" title="Rediger">✏️</button>` : ''}
        <button class="icon-btn" id="tcol-${i}" title="Fold ind/ud">
          <i class="collapse-arrow">▴</i>
        </button>
      </div>
    </div>
    <div class="ticker-body" id="ticker-body-${i}"></div>
  `;

  const body = block.querySelector('#ticker-body-' + i);
  body.appendChild(t.editMode ? buildTickerEdit(i) : buildTickerNormal(i));

  block.querySelector('#toa-' + i).addEventListener('click', e => { e.stopPropagation(); toggleTickerOnAir(i); });
  block.querySelector('#tbr-' + i).addEventListener('click', e => { e.stopPropagation(); toggleTickerBreaking(i); });

  block.querySelector('#ticker-hdr-' + i).addEventListener('click', e => {
    if (!e.target.closest('button')) toggleTickerCollapse(i);
  });
  block.querySelector('#tcol-' + i).addEventListener('click', e => { e.stopPropagation(); toggleTickerCollapse(i); });

  const eb = block.querySelector('#teb-' + i);
  if (eb) eb.addEventListener('click', e => { e.stopPropagation(); enterTickerEdit(i); });

  return block;
}

function buildTickerNormal(i) {
  const t = tickers[i];
  const div = document.createElement('div');
  div.className = 'ticker-normal';
  div.innerHTML = `
    <div class="ticker-overskrift">${esc(t.overskrift) || '<span style="color:#333">—</span>'}</div>
    <div class="ticker-tekst">${esc(t.tekst) || ''}</div>
  `;
  return div;
}

function buildTickerEdit(i) {
  const t = tickers[i];
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="edit-grid" style="margin-bottom:10px;">
      <div class="form-group span2">
        <label class="form-label">Overskrift</label>
        <input class="form-input" id="tov-${i}" value="${esc(t.buf.overskrift)}" placeholder="Overskrift">
      </div>
      <div class="form-group span2">
        <label class="form-label">Tekst</label>
        <input class="form-input" id="ttx-${i}" value="${esc(t.buf.tekst)}" placeholder="Ticker tekst">
      </div>
    </div>
    <div class="edit-actions">
      <button class="btn btn-save"   id="tgem-${i}">💾 GEM</button>
      <button class="btn btn-cancel" id="tann-${i}">ANNULLER</button>
      <button class="btn btn-reset"  id="tnul-${i}">RYD</button>
    </div>
  `;

  div.querySelector('#tov-' + i).addEventListener('input', e => { t.buf.overskrift = e.target.value; });
  div.querySelector('#ttx-' + i).addEventListener('input', e => { t.buf.tekst      = e.target.value; });
  div.querySelector('#tov-' + i).addEventListener('blur',  e => {
    const val = e.target.value.toUpperCase();
    e.target.value   = val;
    t.buf.overskrift = val;
  });

  div.querySelector('#tgem-' + i).addEventListener('click', () => saveTickerRow(i));
  div.querySelector('#tann-' + i).addEventListener('click', () => { t.editMode = false; rerenderTicker(i); });
  div.querySelector('#tnul-' + i).addEventListener('click', () => {
    t.buf.overskrift = ''; t.buf.tekst = '';
    div.querySelector('#tov-' + i).value = '';
    div.querySelector('#ttx-' + i).value = '';
  });

  return div;
}

function toggleTickerCollapse(i) { tickers[i].collapsed = !tickers[i].collapsed; rerenderTicker(i); }

function toggleTickerOnAir(i) {
  if (!tickers[i].onAir && !tickerKlarTilOnAir(i)) return;
  tickers[i].onAir = !tickers[i].onAir;
  tickers[i].onAirPending = true;
  rerenderTicker(i);
  sbPatch('tickers?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { on_air: tickers[i].onAir })
    .then(() => { tickers[i].onAirPending = false; })
    .catch(() => { tickers[i].onAirPending = false; toast('Fejl ved ON AIR', 'err'); });
}

function toggleTickerBreaking(i) {
  if (!tickers[i].breaking && !tickerKlarTilOnAir(i)) return;
  tickers[i].breaking = !tickers[i].breaking;
  tickers[i].breakingPending = true;
  rerenderTicker(i);
  sbPatch('tickers?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { breaking: tickers[i].breaking })
    .then(() => { tickers[i].breakingPending = false; })
    .catch(() => { tickers[i].breakingPending = false; toast('Fejl ved BREAKING', 'err'); });
}

function enterTickerEdit(i) {
  const t = tickers[i];
  t.buf = { overskrift: t.overskrift, tekst: t.tekst };
  t.editMode = true;
  rerenderTicker(i);
}

async function saveTickerRow(i) {
  const t = tickers[i];
  t.overskrift = t.buf.overskrift.toUpperCase();
  t.tekst      = t.buf.tekst;
  t.editMode   = false;
  t.savePending = true;
  rerenderTicker(i);
  try {
    await sbPatch('tickers?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { overskrift: t.overskrift, tekst: t.tekst });
    toast('Gemt ✓', 'ok');
  } catch { toast('Fejl ved gem', 'err'); }
  finally { t.savePending = false; }
}

// ── SUBS RENDER ───────────────────────────────────────────────
function renderSubs() {
  const container = document.getElementById('subsList');
  if (!container) return;
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'subs-grid';

  // Sektion: SUBS (venstre)
  const sec1 = document.createElement('div');
  sec1.className = 'subs-section';
  sec1.innerHTML = '<div class="subs-section-title" style="color:var(--blue)">Subs</div>';
  subs.forEach((_, i) => sec1.appendChild(buildSubRow(i)));
  grid.appendChild(sec1);

  // Sektion: VMIX CALLS (højre)
  const sec2 = document.createElement('div');
  sec2.className = 'subs-section';
  sec2.innerHTML = '<div class="subs-section-title" style="color:#a855f7">vMix Calls</div>';
  vmixCalls.forEach((_, i) => sec2.appendChild(buildVmixCallRow(i)));
  grid.appendChild(sec2);

  container.appendChild(grid);
}

async function toggleSubOnAir(slot) {
  const newSlot = activeSubSlot === slot ? 0 : slot;
  try {
    await sbPatch('settings?projekt_id=eq.' + aktivProjektId + '&key=eq.active_sub', { value: String(newSlot) });
    activeSubSlot = newSlot;
    subs.forEach((_, i) => rerenderSub(i));
  } catch { toast('Fejl ved sub on air', 'err'); }
}

function rerenderSub(i) {
  const old = document.getElementById('sub-' + i);
  if (old) old.replaceWith(buildSubRow(i));
}

function rerenderVmixCall(i) {
  const old = document.getElementById('vcall-' + i);
  if (old) old.replaceWith(buildVmixCallRow(i));
}

function buildSubRow(i) {
  const s   = subs[i];
  const row = document.createElement('div');
  row.id        = 'sub-' + i;
  row.className = 'sub-row';

  if (s.editMode) {
    row.innerHTML = `
      <span class="sub-num">${i + 1}</span>
      <div class="sub-edit-fields">
        <input class="form-input navn-input"  id="sn-${i}" value="${esc(s.buf.navn)}"  placeholder="Navn">
        <input class="form-input titel-input" id="st-${i}" value="${esc(s.buf.titel)}" placeholder="Titel">
      </div>
      <div class="sub-actions">
        <button class="btn-sm save"   id="sg-${i}">GEM</button>
        <button class="btn-sm cancel" id="sa-${i}">ANNULLER</button>
        <button class="btn-sm reset"  id="sr-${i}">RYD</button>
      </div>`;
    row.querySelector('#sn-' + i).addEventListener('input',  e => { s.buf.navn  = e.target.value; });
    row.querySelector('#st-' + i).addEventListener('input',  e => { s.buf.titel = e.target.value; });
    titleCaseInput(row.querySelector('#sn-' + i), s.buf, 'navn');
    titleCaseInput(row.querySelector('#st-' + i), s.buf, 'titel');
    row.querySelector('#sg-' + i).addEventListener('click',  () => saveSubRow(i));
    row.querySelector('#sa-' + i).addEventListener('click',  () => { s.editMode = false; rerenderSub(i); });
    row.querySelector('#sr-' + i).addEventListener('click',  () => {
      s.buf.navn = ''; s.buf.titel = '';
      row.querySelector('#sn-' + i).value = '';
      row.querySelector('#st-' + i).value = '';
    });
  } else {
    const hasData = s.navn || s.titel;
    if (!hasData) row.classList.add('no-data');
    const slot = i + 1;
    const isActive = activeSubSlot === slot;
    const showOnBtn = aktivProjektId === '3ae7eb3e-db19-4285-9964-6c8382ea471f';
    row.innerHTML = `
      <span class="sub-num">${slot}</span>
      <span class="sub-text ${hasData ? '' : 'empty'}">${hasData
        ? `<span class="sub-navn">${esc(s.navn)}</span><span class="sub-titel">${esc(s.titel)}</span>`
        : '—'}</span>
      ${showOnBtn ? `<button class="sub-on-btn ${isActive ? 'active' : ''}" id="son-${i}">${isActive ? 'OFF AIR' : 'ON AIR'}</button>` : ''}
      <button class="icon-btn" id="seb-${i}" title="Rediger">✏️</button>`;
    if (showOnBtn) {
      row.querySelector('#son-' + i).addEventListener('click', () => toggleSubOnAir(slot));
    }
    row.querySelector('#seb-' + i).addEventListener('click', () => {
      s.buf = { navn: s.navn, titel: s.titel };
      s.editMode = true;
      rerenderSub(i);
    });
  }
  return row;
}

function buildVmixCallRow(i) {
  const c    = vmixCalls[i];
  const row  = document.createElement('div');
  row.id     = 'vcall-' + i;

  // Tjek om kamp 1-6 bruger denne slot (kun relevant i kampdag-projekter)
  const kampBruger = projektType === 'kampdag' && i < 6 && kampe[i] && kampe[i].hold1Lang;
  row.className = 'sub-row vmix-call-row'
    + (kampBruger && !c.editMode ? ' grayed' : '')
    + (!kampBruger && !c.editMode && !c.navn && !c.titel ? ' no-data' : '')
    + (c.collapsed && !c.editMode ? ' collapsed' : '');

  // Collapsed: vis kun nummer + navn som én linje
  if (c.collapsed && !c.editMode) {
    const hasData = c.navn || c.titel;
    row.innerHTML = `
      <span class="sub-num">${i + 1}</span>
      <span class="sub-text" style="flex:1">${hasData
        ? `<span class="sub-navn">${esc(c.navn)}</span>`
        : '<span style="color:#333">—</span>'}</span>
      <button class="icon-btn vmix-col-btn" id="vccol-${i}" title="Fold ud"><i class="collapse-arrow" style="transform:rotate(180deg)">▴</i></button>`;
    row.querySelector('#vccol-' + i).addEventListener('click', () => {
      c.collapsed = false; rerenderVmixCall(i);
    });
    return row;
  }

  if (c.editMode) {
    row.innerHTML = `
      <span class="sub-num">${i + 1}</span>
      <div class="sub-edit-fields">
        <input class="form-input navn-input"  id="vcn-${i}" value="${esc(c.buf.navn)}"  placeholder="Navn">
        <input class="form-input titel-input" id="vct-${i}" value="${esc(c.buf.titel)}" placeholder="Titel">
        <div style="display:flex;gap:6px;align-items:center;">
          <input class="form-input" id="vcl-${i}" value="${esc(c.buf.link)}" placeholder="vMix Call Link" style="flex:1;">
          <button class="copy-btn icon-btn" id="vccp-${i}" title="Kopiér link">⎘</button>
        </div>
      </div>
      <div class="sub-actions">
        <button class="btn-sm save"   id="vcg-${i}">GEM</button>
        <button class="btn-sm cancel" id="vca-${i}">ANNULLER</button>
        <button class="btn-sm reset"  id="vcr-${i}">RYD</button>
      </div>`;
    row.querySelector('#vcn-'  + i).addEventListener('input', e => { c.buf.navn  = e.target.value; });
    row.querySelector('#vct-'  + i).addEventListener('input', e => { c.buf.titel = e.target.value; });
    titleCaseInput(row.querySelector('#vcn-' + i), c.buf, 'navn');
    titleCaseInput(row.querySelector('#vct-' + i), c.buf, 'titel');
    row.querySelector('#vcl-'  + i).addEventListener('input', e => { c.buf.link  = e.target.value; });
    row.querySelector('#vccp-' + i).addEventListener('click', () => copyText(row.querySelector('#vcl-' + i).value));
    row.querySelector('#vcg-'  + i).addEventListener('click', () => saveVmixCallRow(i));
    row.querySelector('#vca-'  + i).addEventListener('click', () => { c.editMode = false; rerenderVmixCall(i); });
    row.querySelector('#vcr-'  + i).addEventListener('click', () => {
      c.buf.navn = ''; c.buf.titel = ''; c.buf.link = '';
      row.querySelector('#vcn-' + i).value = '';
      row.querySelector('#vct-' + i).value = '';
      row.querySelector('#vcl-' + i).value = '';
    });
  } else {
    const hasData = c.navn || c.titel;
    row.innerHTML = `
      <span class="sub-num">${i + 1}</span>
      ${kampBruger
        ? `<span class="sub-uses-kamp">BRUGES AF KAMP ${i + 1}</span>`
        : `<span class="sub-text ${hasData ? '' : 'empty'}">${hasData
            ? `<span class="sub-navn">${esc(c.navn)}</span><span class="sub-titel">${esc(c.titel)}</span><span class="sub-link-row"><span class="sub-link" title="${esc(c.link)}">${esc(c.link) || ''}</span><button class="copy-btn icon-btn" id="vccp2-${i}" title="Kopiér link">⎘</button></span>`
            : '—'}</span>`}
      ${!kampBruger ? `<button class="icon-btn" id="vceb-${i}" title="Rediger">✏️</button>` : ''}
      <button class="icon-btn vmix-col-btn" id="vccol-${i}" title="Fold ind"><i class="collapse-arrow">▴</i></button>`;
    const colBtn = row.querySelector('#vccol-' + i);
    if (colBtn) colBtn.addEventListener('click', () => { c.collapsed = true; rerenderVmixCall(i); });

    if (!kampBruger) {
      const cpBtn = row.querySelector('#vccp2-' + i);
      if (cpBtn) cpBtn.addEventListener('click', () => copyText(c.link));
      const ebBtn = row.querySelector('#vceb-' + i);
      if (ebBtn) ebBtn.addEventListener('click', () => {
        c.buf = { navn: c.navn, titel: c.titel, link: c.link };
        c.editMode = true;
        rerenderVmixCall(i);
      });
    }
  }
  return row;
}

async function saveSubRow(i) {
  const s = subs[i];
  s.navn  = s.buf.navn;
  s.titel = s.buf.titel;
  s.editMode = false;
  s.savePending = true;
  rerenderSub(i);
  try {
    await sbPatch('subs?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { navn: s.navn, titel: s.titel });
    toast('Gemt ✓', 'ok');
    flashSaved(document.getElementById('sub-' + i), 'blue');
  } catch { toast('Fejl ved gem', 'err'); }
  finally { s.savePending = false; }
}

async function saveVmixCallRow(i) {
  const c = vmixCalls[i];
  c.navn  = c.buf.navn;
  c.titel = c.buf.titel;
  c.link  = c.buf.link;
  c.editMode = false;
  c.savePending = true;
  rerenderVmixCall(i);
  try {
    await sbPatch('vmix_calls?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { navn: c.navn, titel: c.titel, link: c.link });
    toast('Gemt ✓', 'ok');
    flashSaved(document.getElementById('vcall-' + i), 'purple');
    // Synk link til kamp slot
    if (i < 6 && kampe[i]) {
      kampe[i].vmixcall     = c.link;
      kampe[i].buf.vmixcall = c.link;
      await sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { vmixcall: c.link });
      rerender(i);
    }
  } catch { toast('Fejl ved gem', 'err'); }
  finally { c.savePending = false; }
}

// ── CREDITS STATE ─────────────────────────────────────────────
let creditsData = { items: [], speed: 30 };
let creditNewCounter = 0;
let creditsTriggerActive = false;

function updateCreditsSendBtn() {
  const badge = document.getElementById('creditsTriggerBadge');
  if (!badge) return;
  if (creditsTriggerActive) {
    badge.classList.add('visible');
  } else {
    badge.classList.remove('visible');
  }
}

function initCreditsFromData(data) {
  creditsData.speed = data.speed || 30;
  creditsData.items = (data.items || []).map(d => ({
    ...d, editMode: false, isNew: false, buf: { titel: d.titel, navne: d.navne }
  }));
}

async function refreshCredits() {
  try {
    const pid = aktivProjektId;
    const [creditsRaw, settingsRaw] = await Promise.all([
      sbGet('credits?select=*&projekt_id=eq.' + pid),
      sbGet('settings?select=*&projekt_id=eq.' + pid)
    ]);
    const speedRow   = settingsRaw.find(r => r.key === 'credits_speed');
    const triggerRow = settingsRaw.find(r => r.key === 'credits_trigger');
    creditsTriggerActive = triggerRow ? triggerRow.value === 'in' : false;
    const data = {
      items: creditsRaw.map(r => ({ row: r.id, side: r.side, orden: r.orden, titel: r.titel || '', navne: r.navne || '' })),
      speed: speedRow ? parseFloat(speedRow.value) : 30
    };
    initCreditsFromData(data);
  } catch { /* stille */ }
  renderCredits();
}

function renderCredits() {
  const container = document.getElementById('creditsList');
  if (!container) return;
  container.innerHTML = '';

  // Speed bar
  const speedBar = document.createElement('div');
  speedBar.className = 'credits-speed-bar';
  speedBar.innerHTML = `
    <span class="credits-speed-label">Hastighed</span>
    <input type="range" class="speed-slider" id="speedSlider" min="10" max="30" step="1" value="${creditsData.speed}">
    <span class="credits-speed-val" id="speedVal">${creditsData.speed} sek</span>
    <button class="btn btn-save" id="saveSpeedBtn">GEM</button>
    <button class="btn btn-cancel" id="previewBtn" style="margin-left:auto;">▶ PREVIEW</button>
    <span class="credits-live-badge" id="creditsTriggerBadge"><span class="credits-live-dot"></span>LIVE</span>
    <div style="display:flex;align-items:center;gap:6px;background:#0d0d0d;border:1px solid #2e2e2e;border-radius:6px;padding:5px 10px;max-width:320px;overflow:hidden;">
      <span style="font-size:11px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;" id="creditsUrlText">https://vmix-control.vercel.app/credits.html?p=${aktivProjektId}</span>
      <button class="copy-btn icon-btn" id="creditsUrlCopy" title="Kopiér link">⎘</button>
    </div>`;
  container.appendChild(speedBar);
  updateCreditsSendBtn();
  speedBar.querySelector('#speedSlider').addEventListener('input', e => {
    creditsData.speed = parseInt(e.target.value);
    document.getElementById('speedVal').textContent = creditsData.speed + ' sek';
  });
  speedBar.querySelector('#saveSpeedBtn').addEventListener('click', async () => {
    try {
      await sbPatch('settings?projekt_id=eq.' + aktivProjektId + '&key=eq.credits_speed', { value: creditsData.speed.toString() });
      toast('Hastighed gemt ✓', 'ok');
    } catch { toast('Fejl ved gem', 'err'); }
  });
  speedBar.querySelector('#creditsUrlCopy').addEventListener('click', () => copyText('https://vmix-control.vercel.app/credits.html?p=' + aktivProjektId));
  speedBar.querySelector('#previewBtn').addEventListener('click', () => {
    const modal = document.getElementById('previewModal');
    const frame = document.getElementById('previewFrame');
    frame.src = 'credits.html?preview=1&p=' + aktivProjektId + '&t=' + Date.now();
    modal.style.display = 'flex';
  });

  // Two columns
  const cols = document.createElement('div');
  cols.className = 'credits-cols';

  function buildCol(side, label) {
    const items = creditsData.items.filter(i => i.side === side).sort((a, b) => a.orden - b.orden);
    const col = document.createElement('div');
    col.dataset.side = side;
    col.innerHTML = `<div class="credits-col-header">${label}</div>`;
    items.forEach(item => col.appendChild(buildCreditCard(item, side)));
    const addBtn = document.createElement('button');
    addBtn.className = 'credit-add-btn';
    addBtn.textContent = '+ TILFØJ SEKTION';
    addBtn.addEventListener('click', () => addCreditItem(side));
    col.appendChild(addBtn);
    return col;
  }

  cols.appendChild(buildCol('V', 'Venstre kolonne'));
  cols.appendChild(buildCol('H', 'Højre kolonne'));
  container.appendChild(cols);
}

let dragSrc = null;

function buildCreditCard(item, side) {
  const card = document.createElement('div');
  card.className = 'credit-card';
  card.id = 'credit-' + item.row;
  card.draggable = true;
  card.dataset.row = item.row;
  card.dataset.side = side;

  card.addEventListener('dragstart', e => {
    dragSrc = item.row;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.credit-card.drag-over').forEach(el => el.classList.remove('drag-over'));
  });
  card.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragSrc !== item.row) card.classList.add('drag-over');
  });
  card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
  card.addEventListener('drop', e => {
    e.preventDefault();
    card.classList.remove('drag-over');
    if (dragSrc === item.row) return;
    reorderCredits(dragSrc, item.row, side);
  });
  card.addEventListener('dragenter', e => { e.preventDefault(); });

  // Touch support
  let touchStartY = 0;
  card.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
    dragSrc = item.row;
    card.classList.add('dragging');
  }, { passive: true });
  card.addEventListener('touchmove', e => { e.preventDefault(); }, { passive: false });
  card.addEventListener('touchend', e => {
    card.classList.remove('dragging');
    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const target = el && el.closest('.credit-card');
    if (target && target.dataset.row !== String(item.row)) {
      reorderCredits(item.row, target.dataset.row, target.dataset.side || side);
    }
  });

  if (item.editMode) {
    card.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <input class="form-input" id="crt-${item.row}" value="${esc(item.buf.titel)}" placeholder="Titel (f.eks. VÆRTER)">
        <textarea class="form-input" id="crn-${item.row}" placeholder="Ét navn per linje">${esc(item.buf.navne)}</textarea>
        <div style="display:flex;gap:8px;margin-top:2px;">
          <button class="btn btn-save" id="crg-${item.row}">GEM</button>
          <button class="btn btn-cancel" id="cra-${item.row}">ANNULLER</button>
        </div>
      </div>`;
    card.querySelector('#crt-' + item.row).addEventListener('input', e => { item.buf.titel = e.target.value; });
    card.querySelector('#crn-' + item.row).addEventListener('input', e => { item.buf.navne = e.target.value; });
    card.querySelector('#crg-' + item.row).addEventListener('click', () => saveCreditItem(item));
    card.querySelector('#cra-' + item.row).addEventListener('click', () => {
      if (item.isNew) creditsData.items = creditsData.items.filter(i => i !== item);
      else item.editMode = false;
      renderCredits();
    });
    setTimeout(() => { const el = card.querySelector('#crt-' + item.row); if (el) el.focus(); }, 30);
  } else {
    const navneLines = item.navne.split(/[\n,]/).map(n => n.trim()).filter(Boolean);
    card.innerHTML = `
      <div class="credit-card-header">
        <div class="credit-card-content">
          <div class="credit-card-titel">${esc(item.titel)}</div>
          <div class="credit-card-navne">${navneLines.map(esc).join('<br>')}</div>
        </div>
        <div class="credit-card-actions">
          <button class="icon-btn" id="creb-${item.row}" title="Rediger">✏️</button>
          <button class="icon-btn" id="crdel-${item.row}" title="Slet">🗑</button>
        </div>
      </div>`;
    card.querySelector('#creb-' + item.row).addEventListener('click', () => {
      item.buf = { titel: item.titel, navne: item.navne };
      item.editMode = true;
      renderCredits();
    });
    card.querySelector('#crdel-' + item.row).addEventListener('click', () => deleteCreditItem(item));
  }
  return card;
}

async function reorderCredits(srcRow, targetRow, targetSide) {
  const srcItem = creditsData.items.find(i => String(i.row) === String(srcRow));
  if (!srcItem) return;

  // Opdater side hvis kortet flyttes til anden kolonne
  srcItem.side = targetSide;

  // Genberegn orden i target-kolonnen
  const targetItems = creditsData.items.filter(i => i.side === targetSide).sort((a, b) => a.orden - b.orden);
  const srcIdx    = targetItems.findIndex(i => String(i.row) === String(srcRow));
  const targetIdx = targetItems.findIndex(i => String(i.row) === String(targetRow));

  if (srcIdx !== -1) targetItems.splice(srcIdx, 1);
  const insertAt = targetItems.findIndex(i => String(i.row) === String(targetRow));
  targetItems.splice(insertAt === -1 ? targetItems.length : insertAt, 0, srcItem);

  const updates = targetItems.map((item, idx) => {
    item.orden = idx + 1;
    return sbPatch('credits?id=eq.' + item.row, { side: item.side, orden: item.orden });
  });

  // Genberegn orden i kilde-kolonnen hvis forskellig
  if (srcItem.side !== targetSide) {
    const srcSideItems = creditsData.items.filter(i => i.side !== targetSide).sort((a, b) => a.orden - b.orden);
    srcSideItems.forEach((item, idx) => {
      item.orden = idx + 1;
      updates.push(sbPatch('credits?id=eq.' + item.row, { orden: item.orden }));
    });
  }

  renderCredits();
  try {
    await Promise.all(updates);
  } catch { toast('Fejl ved rækkefølge', 'err'); }
}

function addCreditItem(side) {
  const sideItems = creditsData.items.filter(i => i.side === side);
  const maxOrden = sideItems.length > 0 ? Math.max(...sideItems.map(i => i.orden)) : 0;
  const tempRow = 'new' + (++creditNewCounter);
  creditsData.items.push({
    row: tempRow, isNew: true, side,
    orden: maxOrden + 1,
    titel: '', navne: '',
    editMode: true, buf: { titel: '', navne: '' }
  });
  renderCredits();
}

async function saveCreditItem(item) {
  item.titel = item.buf.titel;
  item.navne = item.buf.navne;
  try {
    const creditBody = { side: item.side, orden: item.orden, titel: item.titel, navne: item.navne, projekt_id: aktivProjektId };
    if (!item.row || String(item.row).startsWith('new')) {
      await sbPost('credits', creditBody);
    } else {
      await sbPatch('credits?id=eq.' + item.row, creditBody);
    }
    toast('Gemt ✓', 'ok');
    await refreshCredits();
  } catch {
    item.editMode = false;
    toast('Fejl ved gem', 'err');
    renderCredits();
  }
}

async function deleteCreditItem(item) {
  creditsData.items = creditsData.items.filter(i => i !== item);
  renderCredits();
  if (!item.isNew) {
    try {
      await sbDelete('credits?id=eq.' + item.row);
      await refreshCredits();
    } catch { toast('Fejl ved sletning', 'err'); }
  }
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  const session = await requireAuth();
  if (!session) return;

  // Header-knapper
  document.getElementById('backBtn').addEventListener('click', () => { window.location.href = 'projects.html'; });
  document.getElementById('logoutBtn').addEventListener('click', () => signOut());

  // Presence — vis at brugeren er online
  const _presenceSide = aktivProjektId ? 'app:' + aktivProjektId : 'app';
  const _presenceCh = sbClient.channel('online-users');
  _presenceCh.subscribe(async status => {
    if (status === 'SUBSCRIBED') {
      await _presenceCh.track({ user_id: session.user.id, email: session.user.email, side: _presenceSide });
    }
  });

  // Vis projekt-undertitel fra URL hvis tilgængeligt
  if (aktivProjektId) {
    fetch(SB_URL + '/rest/v1/projekter?id=eq.' + aktivProjektId + '&select=undertitel,type', { headers: SB_HEADERS })
      .then(r => r.json())
      .then(rows => {
        if (!rows[0]) return;
        if (rows[0].undertitel) {
          document.getElementById('projectUndertitel').textContent = rows[0].undertitel;
        }
        projektType = rows[0].type;
        if (rows[0].type === 'tv') {
          // Skjul KAMPE, STAMDATA og DASHBOARD — aktiver SUBS som standard
          const kampeBtn     = document.querySelector('.tab-btn[data-tab="kampe"]');
          const stamdataBtn  = document.querySelector('.tab-btn[data-tab="admin"]');
          const dashboardBtn = document.querySelector('.tab-btn[data-tab="live"]');
          const subsBtn      = document.querySelector('.tab-btn[data-tab="subs"]');
          if (kampeBtn)     kampeBtn.style.display     = 'none';
          if (stamdataBtn)  stamdataBtn.style.display  = 'none';
          if (dashboardBtn) dashboardBtn.style.display = 'none';
          // Skjul også STAMDATA-knappen i headeren
          const headerStamdataBtn = document.querySelector('header .tab-btn[data-tab="admin"]');
          if (headerStamdataBtn) headerStamdataBtn.style.display = 'none';
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
          if (subsBtn) subsBtn.classList.add('active');
          document.getElementById('tab-subs').classList.add('active');
        }
      }).catch(() => {});
  }

  try {
    const all = await fetchAll();

    dropdowns = all.dropdowns;

    all.kampe.forEach((data, i) => { kampe[i] = { ...kampe[i], ...data }; });

    if (all.subs) {
      all.subs.subs.forEach((data, i)      => { subs[i]      = { ...subs[i],      ...data }; });
      all.subs.vmixCalls.forEach((data, i) => { vmixCalls[i] = { ...vmixCalls[i], ...data }; });
    }

    if (all.tickers) {
      all.tickers.forEach((data, i) => { tickers[i] = { ...tickers[i], ...data }; });
    }

    if (all.credits) {
      initCreditsFromData(all.credits);
    }

    document.getElementById('previewClose').addEventListener('click', () => {
      document.getElementById('previewModal').style.display = 'none';
      document.getElementById('previewFrame').src = '';
    });
    document.getElementById('previewModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        e.currentTarget.style.display = 'none';
        document.getElementById('previewFrame').src = '';
      }
    });

    renderAll();
    renderSubs();
    renderTickers();
    renderCredits();
    await refreshDropdowns();
    initStamdata();
    const loader = document.getElementById('pageLoader');
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 200);
  } catch (err) {
    document.getElementById('pageLoader').style.display = 'none';
    document.getElementById('kampList').innerHTML =
      `<div class="load-err">Fejl ved indlæsning.<br>Tjek Supabase forbindelsen.<br><small style="color:#555">${err.message}</small></div>`;
  }
}

init();

// ── LIVE DASHBOARD ────────────────────────────────────────────
let liveTimer    = null;
let lastCardSeen = {}; // fixtureId → sidste sete korttype+minut+spiller

function startLivePolling() {
  fetchLiveMatches();
  liveTimer = setInterval(fetchLiveMatches, 60000);
}

function stopLivePolling() {
  clearInterval(liveTimer);
  liveTimer = null;
}

async function fetchLiveMatches() {
  const grid = document.getElementById('liveGrid');
  const upd  = document.getElementById('liveUpdated');
  if (!grid) return;

  // Kampe med enetpulse-ID bruger enetpulse; resten bruger API-Football
  const enetIds = kampe.filter(k => k.enetpulseId).map(k => k.enetpulseId);
  const aflIds  = kampe.filter(k => k.fixtureId && !k.enetpulseId).map(k => k.fixtureId);

  if (!enetIds.length && !aflIds.length) {
    grid.innerHTML = '<div class="live-no-fixtures">INGEN KAMPE VALGT</div>';
    upd.textContent = '';
    return;
  }

  try {
    const [enetData, aflData] = await Promise.all([
      enetIds.length
        ? fetch('/api/enetpulse?ids=' + enetIds.join(',')).then(r => r.json()).catch(() => ({ matches: [] }))
        : Promise.resolve({ matches: [] }),
      aflIds.length
        ? fetch('/api/live-match?ids=' + aflIds.join(',')).then(r => r.json()).catch(() => ({ matches: [] }))
        : Promise.resolve({ matches: [] })
    ]);

    // Byg lookup-maps (ID → match-objekt)
    const enetMap = {};
    (enetData.matches || []).forEach(m => { if (m.id) enetMap[String(m.id)] = m; });
    const aflMap = {};
    (aflData.matches || []).forEach(m => { if (m.id) aflMap[String(m.id)] = m; });

    // Berig enetpulse-kampe med lokale holdnavne fra kamp-state
    for (const k of kampe) {
      if (!k.enetpulseId) continue;
      const m = enetMap[String(k.enetpulseId)];
      if (!m || m.error) continue;
      if (k.hold1Kort) m.home_kort = k.hold1Kort;
      if (k.hold2Kort) m.away_kort = k.hold2Kort;
      if (k.hold1Lang) m.home = k.hold1Lang;
      if (k.hold2Lang) m.away = k.hold2Lang;
    }

    // Vis kort i slot-rækkefølge
    const cards = [];
    for (let i = 0; i < kampe.length; i++) {
      const k = kampe[i];
      if (k.enetpulseId && enetMap[String(k.enetpulseId)]) {
        cards.push(renderLiveCard(enetMap[String(k.enetpulseId)]));
      } else if (k.fixtureId && !k.enetpulseId && aflMap[String(k.fixtureId)]) {
        cards.push(renderLiveCard(aflMap[String(k.fixtureId)]));
      }
    }
    grid.innerHTML = cards.length ? cards.join('') : '<div class="live-no-fixtures">INGEN KAMPE VALGT</div>';
    upd.textContent = 'Sidst opdateret ' + new Date().toLocaleTimeString('da-DK');

    // Status til Supabase — enetpulse-kampe
    for (let i = 0; i < kampe.length; i++) {
      const k = kampe[i];
      if (!k.enetpulseId) continue;
      const m = enetMap[String(k.enetpulseId)];
      if (!m || m.error) continue;
      await sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), {
        status_short:   m.status.short   || null,
        status_elapsed: m.status.elapsed ?? null
      }).catch(() => {});
    }

    // Kort-alert + status til Supabase — API-Football kampe
    for (const m of (aflData.matches || [])) {
      if (m.error) continue;
      const kampIdx = kampe.findIndex(k => k.fixtureId === m.id);
      if (kampIdx === -1) continue;
      const slot = kampIdx + 1;

      const kortEvents = m.events.filter(e => e.type === 'Card');
      if (kortEvents.length) {
        const latest  = kortEvents[kortEvents.length - 1];
        const key     = `${latest.type}_${latest.detail}_${latest.minute}_${latest.player}`;
        if (lastCardSeen[m.id] !== key) {
          lastCardSeen[m.id] = key;
          const cardType  = latest.detail === 'Red Card' ? 'red' : latest.detail === 'Yellow Red Card' ? 'yr' : 'yellow';
          const teamKort  = latest.team === m.away_api ? (m.away_kort || m.away) : (m.home_kort || m.home);
          await sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + slot, {
            last_card_type: cardType, last_card_player: latest.player,
            last_card_min:  String(latest.minute), last_card_team_kort: teamKort
          }).catch(() => {});
        }
      }
      await sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + slot, {
        status_short:   m.status.short   || null,
        status_elapsed: m.status.elapsed ?? null
      }).catch(() => {});
    }
  } catch { upd.textContent = 'Netværksfejl'; }
}

function liveStatusClass(short) {
  if (['1H','2H','ET','P','LIVE'].includes(short)) return 'playing';
  if (short === 'HT') return 'ht';
  if (short === 'FT' || short === 'AET' || short === 'PEN') return 'ft';
  return 'ns';
}

function liveStatusLabel(status) {
  if (status.short === 'NS')  return 'IKKE STARTET';
  if (status.short === 'HT')  return 'PAUSE';
  if (status.short === 'FT')  return 'SLUTFLØJT';
  if (status.short === 'AET') return 'EFTER FORLÆNGING';
  if (status.short === 'PEN') return 'EFTER STRAFFE';
  if (status.elapsed != null) return status.elapsed + "'";
  return status.short;
}

function liveEventIcon(type, detail) {
  if (type === 'Goal') {
    if (detail === 'Own Goal')   return 'og';
    if (detail === 'Penalty')    return 'pen';
    return 'goal';
  }
  if (type === 'Card') {
    if (detail === 'Yellow Card')            return 'yc';
    if (detail === 'Red Card')               return 'rc';
    if (detail === 'Yellow Red Card')        return 'yr';
  }
  if (type === 'subst') return 'sub';
  return 'sub';
}

function renderLiveCard(m) {
  if (m.error) return `<div class="live-card"><div class="live-card-header"><div class="live-league">${m.id}</div><div class="live-no-fixtures" style="padding:20px">${m.error}</div></div></div>`;

  const statusCls   = liveStatusClass(m.status.short);
  const statusLabel = liveStatusLabel(m.status);

  const eventsHtml = m.events.length
    ? m.events.map(e => {
        const iconCls = liveEventIcon(e.type, e.detail);
        const isAway  = e.team === m.away_api || e.team === m.away;
        const assist  = e.assist ? ` <span class="live-event-assist">(${e.assist})</span>` : '';
        const subInfo = e.type === 'subst'
          ? `<span class="live-event-name"><span style="color:var(--green)">▲</span> ${e.player}${e.assist ? ` <span style="color:var(--red)">▼</span> ${e.assist}` : ''}</span>`
          : `<span class="live-event-name">${e.player}${assist}</span>`;
        return `<div class="live-event${isAway ? ' away' : ''}">
          <span class="live-event-min">${e.minute}'</span>
          <span class="live-event-icon ${iconCls}"></span>
          ${subInfo}
        </div>`;
      }).join('')
    : '<div class="live-event" style="color:#333;justify-content:center">ingen hændelser endnu</div>';

  function renderStats(stats) {
    if (!stats || stats.length < 2) return '';
    const h = stats[0].stats;
    const a = stats[1].stats;
    const LABELS = {
      'Ball Possession':  'Boldbesiddelse',
      'Shots on Goal':    'Skud på mål',
      'Total Shots':      'Skud i alt',
      'Corner Kicks':     'Hjørnespark',
      'Fouls':            'Frispark',
      'Passes %':         'Afleveringer %'
    };
    return '<div class="live-stats">' + Object.entries(LABELS).map(([key, label]) => {
      const hv = h[key] ?? '—';
      const av = a[key] ?? '—';
      const hNum = parseFloat(String(hv)) || 0;
      const aNum = parseFloat(String(av)) || 0;
      const total = hNum + aNum;
      const hPct  = total > 0 ? (hNum / total * 100) : 50;
      const aPct  = total > 0 ? (aNum / total * 100) : 50;
      return `<div class="live-stat-row">
        <span class="live-stat-val">${hv}</span>
        <div class="live-stat-bar"><div class="live-stat-bar-fill" style="width:${hPct}%"></div></div>
        <span class="live-stat-label">${label}</span>
        <div class="live-stat-bar away"><div class="live-stat-bar-fill" style="width:${aPct}%"></div></div>
        <span class="live-stat-val away">${av}</span>
      </div>`;
    }).join('') + '</div>';
  }

  return `
    <div class="live-card">
      <div class="live-card-header">
        <div class="live-score-row">
          <span class="live-team">
            <span class="live-team-name">${m.home}</span>
            ${m.home_kort ? `<span class="live-team-kort">${m.home_kort}</span>` : ''}
          </span>
          <span class="live-score">${m.homeGoals} – ${m.awayGoals}</span>
          <span class="live-team away">
            <span class="live-team-name">${m.away}</span>
            ${m.away_kort ? `<span class="live-team-kort">${m.away_kort}</span>` : ''}
          </span>
        </div>
        <div class="live-status ${statusCls}">${statusLabel}</div>
        <div class="live-league">${m.league}</div>
      </div>
      <div class="live-events">${eventsHtml}</div>
      ${renderStats(m.stats)}
      ${renderLineup(m.lineup)}
    </div>`;
}

function renderLineup(lineup) {
  if (!lineup) return '';
  const home = lineup.home || [];
  const away = lineup.away || [];
  if (!home.length && !away.length) return '';

  function side(players, label) {
    const starters = players.filter(p => p.starter);
    const subs     = players.filter(p => !p.starter);
    if (!starters.length && !subs.length) return '';
    return `
      <div class="lu-side">
        <div class="lu-side-title">${label}</div>
        ${starters.map(p => `<div class="lu-player"><span class="lu-shirt">${p.shirt}</span>${p.pos ? `<span class="lu-pos">${p.pos}</span>` : ''}<span class="lu-name">${esc(p.name)}</span></div>`).join('')}
        ${subs.length ? `<div class="lu-sub-divider">Reserver</div>` + subs.map(p => `<div class="lu-player lu-sub"><span class="lu-shirt">${p.shirt}</span><span class="lu-name">${esc(p.name)}</span></div>`).join('') : ''}
      </div>`;
  }

  return `<div class="live-lineup">${side(home, 'Hjemme')}${side(away, 'Ude')}</div>`;
}

// ── REALTIME ──────────────────────────────────────────────────
// sbClient defineret i js/auth.js

function applyKampRow(row) {
  if (row.projekt_id !== aktivProjektId) return;
  const i = row.slot - 1;
  if (i < 0 || i > 5) return;
  if (kampe[i].editMode || kampe[i].savePending) return;
  const prev = kampe[i];
  const data = {
    hold1Lang:   row.hold1_lang   || '', hold1Kort: row.hold1_kort || '',
    hold1Score:  row.hold1_score  || 0,  hold2Score: row.hold2_score || 0,
    hold2Kort:   row.hold2_kort   || '', hold2Lang: row.hold2_lang || '',
    kommentator: row.kommentator  || '', lokation: row.lokation || '',
    vmixcall:    row.vmixcall     || '', onAir: row.on_air === true,
    enetpulseId: row.enetpulse_id || null
  };
  const merged = { ...prev, ...data, editMode: false, collapsed: prev.collapsed, buf: prev.buf };
  if (prev.onAirPending) merged.onAir = prev.onAir;
  kampe[i] = merged;
  rerender(i);
}

function applySubRow(row) {
  if (row.projekt_id !== aktivProjektId) return;
  const i = row.slot - 1;
  if (i < 0 || i > 14) return;
  if (subs[i].editMode || subs[i].savePending) return;
  subs[i] = { ...subs[i], navn: row.navn || '', titel: row.titel || '' };
  rerenderSub(i);
}

function applyVmixCallRow(row) {
  if (row.projekt_id !== aktivProjektId) return;
  const i = row.slot - 1;
  if (i < 0 || i > 7) return;
  if (vmixCalls[i].editMode || vmixCalls[i].savePending) return;
  vmixCalls[i] = { ...vmixCalls[i], navn: row.navn || '', titel: row.titel || '', link: row.link || '' };
  rerenderVmixCall(i);
}

function applyTickerRow(row) {
  if (row.projekt_id !== aktivProjektId) return;
  const i = row.slot - 1;
  if (i < 0 || i > 19) return;
  if (tickers[i].editMode || tickers[i].savePending) return;
  const prev = tickers[i];
  const merged = { ...prev, overskrift: row.overskrift || '', tekst: row.tekst || '',
    onAir: row.on_air === true, breaking: row.breaking === true };
  if (prev.onAirPending)    merged.onAir    = prev.onAir;
  if (prev.breakingPending) merged.breaking = prev.breaking;
  tickers[i] = merged;
  rerenderTicker(i);
}

sbClient.channel('db-changes')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kampe' },
      p => applyKampRow(p.new))
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'subs' },
      p => applySubRow(p.new))
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vmix_calls' },
      p => applyVmixCallRow(p.new))
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickers' },
      p => applyTickerRow(p.new))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'credits' },
      () => refreshCredits())
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings' },
      p => {
        if (p.new.key === 'credits_trigger') {
          creditsTriggerActive = p.new.value === 'in';
          updateCreditsSendBtn();
        } else if (p.new.key === 'active_sub') {
          activeSubSlot = parseInt(p.new.value) || 0;
          subs.forEach((_, i) => rerenderSub(i));
        } else {
          refreshCredits();
        }
      })
  .subscribe();
