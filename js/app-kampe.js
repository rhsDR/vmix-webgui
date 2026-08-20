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
      ${k.starttime ? `<div class="info-row"><span class="info-icon">🕐</span><span class="kampstart-tid">Kampstart ${esc(k.starttime)}</span></div>` : ''}
    </div>
    <div class="score-area">
      <div class="team-block">
        ${k.hold1PartFk ? `<img class="team-logo" src="/api/team-image?teamFK=${esc(k.hold1PartFk)}&v=3" onerror="this.style.display='none'" alt="">` : ''}
        <div class="team-name">${esc(k.hold1Kort) || '—'}</div>
        ${k.hold1Lang ? `<div class="team-name-full">${esc(k.hold1Lang)}</div>` : ''}
        <div class="score-row">
          <button class="score-btn" id="s1m-${i}">−</button>
          <div class="score-val" id="sv1-${i}">${k.hold1Score}</div>
          <button class="score-btn" id="s1p-${i}">+</button>
        </div>
      </div>
      <div class="vs-sep">VS</div>
      <div class="team-block">
        ${k.hold2PartFk ? `<img class="team-logo" src="/api/team-image?teamFK=${esc(k.hold2PartFk)}&v=3" onerror="this.style.display='none'" alt="">` : ''}
        <div class="team-name">${esc(k.hold2Kort) || '—'}</div>
        ${k.hold2Lang ? `<div class="team-name-full">${esc(k.hold2Lang)}</div>` : ''}
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

  const holdFields = `
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
        ${buf.enetpulseId ? `<div style="margin-top:4px;font-size:11px;color:#555;">Aktiv: <span style="color:var(--orange)">${esc(k.hold1Lang)} vs ${esc(k.hold2Lang)}</span></div>` : ''}
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
  div.querySelector('#nul-' + i).addEventListener('click', () => resetEdit(i));

  return div;
}

// ── ACTIONS ───────────────────────────────────────────────────

function kampKlarTilOnAir(i) {
  const k = kampe[i];
  return !!(k.hold1Lang && k.hold2Lang && k.kommentator);
}


function toggleCollapse(i) {
  kampe[i].collapsed = !kampe[i].collapsed;
  rerender(i);
}

function toggleOnAir(i) {
  if (!kampe[i].onAir && !kampKlarTilOnAir(i)) return;
  const prevOnAir = kampe[i].onAir;
  kampe[i].onAir = !prevOnAir;
  kampe[i].onAirPending = true;
  _broadcastKampState(i);
  rerender(i);
  sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { on_air: kampe[i].onAir })
    .then(() => {
      kampe[i].onAirPending = false;
      // Auto vis/skjul komm-boks (gatet af master) når on-air faktisk er gemt.
      // Gøres her frem for i applyKampRow, fordi den optimistiske opdatering
      // ovenfor skjuler on-air-transitionen for realtime-ekkoet.
      syncKommBoks(i + 1, kampe[i].onAir);
    })
    .catch(() => {
      // DB-skrivning fejlede: rul knappen tilbage og send den gamle tilstand
      // ud igen, så grafikken på skærmen matcher det der faktisk er gemt.
      kampe[i].onAir = prevOnAir;
      kampe[i].onAirPending = false;
      _broadcastKampState(i);
      rerender(i);
      toast('Fejl ved ON AIR – ikke gemt', 'err');
    });
}

function enterEdit(i) {
  const k = kampe[i];
  k.buf = {
    hold1Lang:   k.hold1Lang,
    hold2Lang:   k.hold2Lang,
    kommentator: k.kommentator,
    lokation:    k.lokation,
    vmixcall:    k.vmixcall,
    lokSomKomm:  false,
    enetpulseId: k.enetpulseId
  };
  k.editMode = true;
  rerender(i);
}

function cancelEdit(i) {
  kampe[i].editMode = false;
  rerender(i);
}


async function searchFixtureByDate(i, div, date) {
  const resultsEl = div.querySelector('#efixresults-' + i);
  resultsEl.innerHTML = '<span style="color:#555;font-size:12px;">Henter kampe…</span>';
  try {
    const res = await apiFetch('/api/fixture-search?date=' + encodeURIComponent(date));
    const data = await res.json();
    if (data.error) {
      resultsEl.innerHTML = `<span style="color:var(--red);font-size:12px;">${esc(data.error)}</span>`;
      return;
    }
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
          _broadcastKampState(i);
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
    const res  = await apiFetch('/api/enetpulse?date=' + encodeURIComponent(date) + '&nocache=1');
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

  kampe[i].buf.enetpulseId = f.id;
  kampe[i].buf.hold1Lang   = h1.lang;
  kampe[i].buf.hold2Lang   = h2.lang;

  toast('Kamp valgt — tryk Gem for at gemme', 'ok');
  rerender(i);
}

function resetEdit(i) {
  const buf = kampe[i].buf;
  buf.hold1Lang = '';
  buf.hold2Lang = '';
  buf.kommentator = '';
  buf.lokation = '';
  buf.lokSomKomm = false;
  buf.enetpulseId = null;
  buf.nulstilScoreOgOnAir = true; // score 0-0 + off air — træder først i kraft ved GEM
  // buf.vmixcall bevares — linket må ikke ryddes
  rerender(i);
}

async function saveKamp(i, div) {
  const k   = kampe[i];
  const buf = k.buf;
  const prevEnetpulseId = k.enetpulseId;

  const h1 = dropdowns.holds.find(h => h.lang === buf.hold1Lang);
  const h2 = dropdowns.holds.find(h => h.lang === buf.hold2Lang);
  k.hold1Lang = buf.hold1Lang;
  k.hold1Kort = h1 ? h1.kort : buf.hold1Lang;
  k.hold2Lang = buf.hold2Lang;
  k.hold2Kort = h2 ? h2.kort : buf.hold2Lang;
  k.kommentator  = buf.kommentator;
  k.lokation     = buf.lokSomKomm ? buf.kommentator : buf.lokation;
  k.vmixcall     = buf.vmixcall;
  k.enetpulseId  = buf.enetpulseId !== undefined ? buf.enetpulseId : k.enetpulseId;
  if (!k.enetpulseId) { k.hold1PartFk = null; k.hold2PartFk = null; k.starttime = ''; }
  if (buf.nulstilScoreOgOnAir) {
    k.hold1Score = 0;
    k.hold2Score = 0;
    k.onAir = false;
  }
  k.editMode     = false;

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
      vmixcall:     k.vmixcall,
      enetpulse_id: k.enetpulseId,
      ...(buf.nulstilScoreOgOnAir ? { on_air: false } : {})
    });
    toast('Gemt ✓', 'ok');
    _broadcastKampState(i);
    if (k.enetpulseId !== prevEnetpulseId) fetchLiveMatches();
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
    _broadcastKampState(i);
  } catch {
    toast('Fejl ved scoreopdatering', 'err');
  }
}

