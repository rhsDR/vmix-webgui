// ── INFO (flere info-bokse) ───────────────────────────────────
// En liste af info-bokse, hver med overskrift + indhold + output (Ingen/Master/Secondary/
// Fullscreen). Gemmes som JSON i settings.info_bokse (pr. projekt) — ingen ny tabel.
// Tekst redigeres i INFO-fanen; OUTPUT vælges UDELUKKENDE under GRAFIK SETUP (INFO-BOKSE).
// Hver boks rider med i sit valgte overlay-vindue; flere på samme overlay stables.
// Vis/skjul styres i vMix. Fanen er kun synlig i Projekt 2 (gating i app-init.js).

// output-mål (overlay-vindue): hoved=Master, komm=Secondary, overlay-3=Fullscreen.
// Ingen på/af i panelet — boksen ligger altid på et overlay, og vMix styrer vis/skjul.
const INFO_OUTPUTS = [['hoved', 'Master'], ['komm', 'Secondary'], ['overlay-3', 'Fullscreen']];
const INFO_OUTPUT_IDS = INFO_OUTPUTS.map(o => o[0]);
// Maks tegn i info-indhold ≈ 3 linjer i grafikken (boksen er ~1100px bred ved 26px versaler).
const INFO_INDHOLD_MAX = 195;

async function loadInfoBokse() {
  try {
    const rows = await sbGet('settings?select=value&key=eq.info_bokse&projekt_id=eq.' + aktivProjektId);
    const v = rows[0] && rows[0].value ? JSON.parse(rows[0].value) : [];
    infoBokse = Array.isArray(v) ? v : [];
    // Normalisér: hver boks ligger altid på et gyldigt overlay (default Master).
    let changed = false;
    infoBokse.forEach(b => {
      if (!INFO_OUTPUT_IDS.includes(b.output)) { b.output = 'hoved'; changed = true; }
      // Migrér gamle bokse (kun indhold) → sider-array (side 1 = indhold).
      if (!Array.isArray(b.sider) || !b.sider.length) b.sider = [b.indhold || ''];
    });
    if (changed) { try { await saveInfoBokse(); } catch {} }
  } catch { infoBokse = []; }
}

async function refreshInfo() { await loadInfoBokse(); renderInfo(); }

async function saveInfoBokse(okMsg) {
  // Side 1 spejles altid til box.indhold, så afviklings-preview og /api/vmix (som læser indhold) matcher.
  infoBokse.forEach(b => { if (Array.isArray(b.sider) && b.sider.length) b.indhold = b.sider[0] || ''; });
  // Fler-bruger-flet (kun hvis JEG har ændret noget): byg ud fra den NYESTE DB-tilstand, læg mine
  // ændrede/tilføjede bokse ovenpå og fjern mine slettede — så en anden operatørs samtidige ændring
  // på ANDRE bokse (fx en overskrift) ikke overskrives af mit gem.
  if (_infoDirty.size || _infoDeleted.size) {
    try {
      const rows = await sbGet('settings?select=value&key=eq.info_bokse&projekt_id=eq.' + aktivProjektId);
      const remote = rows[0] && rows[0].value ? JSON.parse(rows[0].value) : [];
      if (Array.isArray(remote)) {
        const mine = new Map(infoBokse.map(b => [b.id, b]));
        const out = [];
        const seen = new Set();
        remote.forEach(rb => {
          if (!rb || !rb.id || seen.has(rb.id)) return;
          seen.add(rb.id);
          if (_infoDeleted.has(rb.id)) return;                                 // jeg har slettet den
          if (_infoDirty.has(rb.id) && mine.has(rb.id)) { out.push(mine.get(rb.id)); return; } // min version vinder
          out.push(rb);                                                        // andres/urørt → behold remote
        });
        infoBokse.forEach(b => { if (!seen.has(b.id) && !_infoDeleted.has(b.id)) out.push(b); }); // mine nye bokse
        infoBokse = out;
      }
    } catch {}
  }
  // Serialisér KUN de persistente felter — editMode (og øvrige transiente) må IKKE gemmes i DB.
  const _clean = infoBokse.map(b => ({
    id: b.id, overskrift: b.overskrift || '', indhold: b.indhold || '',
    sider: (Array.isArray(b.sider) && b.sider.length) ? b.sider : [b.indhold || ''], output: b.output || 'hoved'
  }));
  await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'info_bokse', value: JSON.stringify(_clean) });
  _infoDirty.clear(); _infoDeleted.clear();
  if (okMsg) toast(okMsg, 'ok');
}

// ── INFO-fanen (kun tekst — INGEN output her) ──
// Maks antal sider pr. info-boks (side 1 + ekstra "side 2/3…" til overløbs-tekst).
const INFO_MAX_SIDER = 5;

// Fler-bruger: spor hvilke bokse DENNE bruger har ændret/tilføjet (_infoDirty) eller slettet
// (_infoDeleted) siden sidste gem. Ved GEM flettes KUN disse oven på den nyeste DB-tilstand, så vi
// publicerer egne ændringer uden at overskrive en anden operatørs samtidige ændringer på andre bokse.
const _infoDirty = new Set();
const _infoDeleted = new Set();

// Opdaterer backdrop (overløb rødt) + auto-højde + tegntæller for ét side-felt.
// INFO_INDHOLD_MAX er en BLØD grænse: alt kan skrives, men det der er over farves rødt.
function _infoRenderOverlay(ta) {
  const wrap = ta.parentElement;
  const bd = wrap && wrap.querySelector('.info-ta-backdrop');
  const val = ta.value;
  const max = INFO_INDHOLD_MAX;
  if (bd) {
    const normal = val.slice(0, max), ovf = val.slice(max);
    bd.innerHTML = esc(normal) + (ovf ? '<span class="ovf">' + esc(ovf) + '</span>' : '') + '​';
  }
  // Auto-højde så al tekst (også den røde) er synlig uden intern scroll.
  ta.style.height = 'auto';
  const h = Math.max(54, ta.scrollHeight);
  ta.style.height = h + 'px';
  if (bd) bd.style.height = h + 'px';
  const countEl = wrap && wrap.nextElementSibling && wrap.nextElementSibling.classList.contains('info-char-count')
    ? wrap.nextElementSibling : null;
  if (countEl) {
    const rest = max - val.length;
    if (rest >= 0) { countEl.textContent = rest + ' tegn tilbage'; countEl.style.color = rest <= 15 ? '#ef4444' : '#888'; }
    else { countEl.textContent = (-rest) + ' tegn for meget'; countEl.style.color = '#ef4444'; }
  }
}

// Blok vises i DISPLAY-mode som standard; blyant → edit-mode (som subs). editMode er transient (gemmes ikke).
function _infoBoxCard(b, idx) {
  return b.editMode ? _infoBoxEdit(b, idx) : _infoBoxDisplay(b, idx);
}

// DISPLAY-mode: overskrift + FULDT indhold for ALLE sider (ikke afkortet) + blyant (rediger) +
// skraldespand (slet blok).
function _infoBoxDisplay(b, idx) {
  const sider = (Array.isArray(b.sider) && b.sider.length) ? b.sider : [b.indhold || ''];
  const vis = sider.map((s, i) => ({ n: i + 1, text: s || '' })).filter(p => p.n === 1 || p.text.trim());
  const fler = vis.length > 1;
  // Hver side som sin egen under-blok inde i hoved-blokken.
  const indholdHTML = vis.map(p => `
    <div style="background:#191919;border:1px solid #343434;border-radius:8px;padding:10px 14px;margin-top:8px;">
      ${fler ? `<div style="font-size:12px;font-weight:700;color:#a0a0a0;letter-spacing:.5px;margin-bottom:4px;">SIDE ${p.n}</div>` : ''}
      <div style="font-size:16px;line-height:1.55;color:#e4e4e4;white-space:pre-wrap;word-break:break-word;">${p.text.trim() ? esc(p.text) : '<span style="color:#666;">(tom)</span>'}</div>
    </div>`).join('');
  return `
    <div class="ticker-block" style="margin-bottom:14px;" data-box="${b.id}">
      <div class="ticker-body" style="display:block;">
        <div style="position:relative;text-align:center;padding:0 56px;margin-bottom:6px;">
          <span class="ticker-num" style="vertical-align:middle;">INFO ${idx + 1}</span>
          <span style="font-size:19px;font-weight:700;color:${b.overskrift ? '#f3f3f3' : '#777'};margin-left:10px;vertical-align:middle;">${esc(b.overskrift || '(uden overskrift)')}</span>
          <div style="position:absolute;top:-2px;right:0;display:flex;gap:2px;">
            <button class="icon-btn" data-act="edit" title="Rediger">✏️</button>
            <button class="icon-btn" data-act="del" title="Slet">🗑</button>
          </div>
        </div>
        ${indholdHTML}
      </div>
    </div>`;
}

// EDIT-mode: overskrift + side-felter + tilføj side + Ryd alt / GEM / ANNULLER.
function _infoBoxEdit(b, idx) {
  const sider = (Array.isArray(b.sider) && b.sider.length) ? b.sider : [b.indhold || ''];
  const flerSider = sider.length > 1;
  const siderHTML = sider.map((s, i) => `
    <div class="info-side" data-side="${i}" style="margin-top:${i ? 8 : 0}px;">
      ${flerSider ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
        <span style="font-size:11px;font-weight:600;color:#9a9a9a;letter-spacing:.5px;">SIDE ${i + 1}</span>
        ${i > 0 ? `<button class="btn" data-side-del="${i}" title="Fjern side" style="margin-left:auto;padding:1px 8px;background:#2a1010;border:1px solid #4a2020;color:#ef4444;font-size:11px;">✕</button>` : ''}
      </div>` : ''}
      <div class="info-ta-wrap">
        <div class="info-ta-backdrop" aria-hidden="true"></div>
        <textarea class="form-input info-ta" data-side-ta="${i}" rows="3" placeholder="${i ? 'Side ' + (i + 1) + ' (overløbs-tekst)' : 'Indhold'}">${esc(s)}</textarea>
      </div>
      <div class="info-char-count" data-side-count="${i}" style="font-size:11px;color:#a5a5a5;text-align:right;margin-top:3px;letter-spacing:.5px;">${INFO_INDHOLD_MAX - (s || '').length} tegn tilbage</div>
    </div>`).join('');
  const addSideBtn = sider.length < INFO_MAX_SIDER
    ? `<button class="btn" data-side-add style="display:inline-block;width:auto;align-self:flex-start;margin-top:8px;padding:5px 12px;font-size:12px;background:#222;border:1px solid #333;color:#bbb;">＋ Tilføj side</button>` : '';
  return `
    <div class="ticker-block" style="margin-bottom:14px;" data-box="${b.id}">
      <div class="ticker-body" style="display:block;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
          <span class="ticker-num">INFO ${idx + 1}</span>
        </div>
        <div class="edit-grid" style="margin-bottom:6px;">
          <div class="form-group span2">
            <label class="form-label">Overskrift</label>
            <input class="form-input" data-field="overskrift" value="${esc(b.overskrift || '')}" placeholder="Overskrift">
          </div>
          <div class="form-group span2">
            <label class="form-label">Indhold</label>
            ${siderHTML}
            ${addSideBtn}
          </div>
        </div>
        <div class="sub-actions" style="margin-top:10px;">
          <button class="btn-sm save"   data-act="gem">GEM</button>
          <button class="btn-sm cancel" data-act="annuller">ANNULLER</button>
          <button class="btn-sm reset"  data-act="ryd" title="Ryd denne bloks indhold (nulstil til 1 side)">RYD</button>
        </div>
      </div>
    </div>`;
}

function renderInfo() {
  const list = document.getElementById('infoList');
  if (!list) return;
  const cards = infoBokse.map(_infoBoxCard).join('');
  list.innerHTML = `
    <div class="credits-speed-bar">
      <button class="btn btn-save" id="infoAdd">＋ Tilføj info-boks</button>
      ${infoBokse.length ? '<button class="btn" id="infoDelAll" style="background:#2a1010;border:1px solid #4a2020;color:#ef4444;margin-left:auto;">✕ Slet alle</button>' : ''}
    </div>
    <div id="infoCards" style="margin-top:14px;">${cards || '<div style="color:#a5a5a5;font-size:13px;padding:12px 0;">Ingen info-bokse endnu. Klik “＋ Tilføj info-boks”.</div>'}</div>`;

  list.querySelector('#infoAdd').addEventListener('click', addInfoBox);
  list.querySelector('#infoDelAll')?.addEventListener('click', deleteAllInfoBokse);
  list.querySelectorAll('[data-box]').forEach(card => {
    const id = card.dataset.box;
    const box = infoBokse.find(b => b.id === id);
    if (!box) return;

    // DISPLAY-mode: blyant → edit, skraldespand → slet blok.
    if (!box.editMode) {
      card.querySelector('[data-act="edit"]').addEventListener('click', () => { box.editMode = true; renderInfo(); });
      card.querySelector('[data-act="del"]').addEventListener('click', async () => {
        if (!confirm('Slet denne info-boks?')) return;
        _infoDeleted.add(id); _infoDirty.delete(id);
        infoBokse = infoBokse.filter(b => b.id !== id);
        try { await saveInfoBokse('Slettet'); } catch { toast('Fejl ved slet', 'err'); }
        renderInfo();
      });
      return;
    }

    // EDIT-mode. Side 1 spejles til box.indhold (afviklings-preview + /api/vmix). Tilføj/fjern side og
    // Ryd alt ændrer KUN hukommelsen — gemmes først ved GEM; ANNULLER genindlæser og kasserer.
    card.querySelector('[data-field="overskrift"]').addEventListener('input', e => { box.overskrift = e.target.value; _infoDirty.add(box.id); });
    if (!Array.isArray(box.sider) || !box.sider.length) box.sider = [box.indhold || ''];
    card.querySelectorAll('[data-side-ta]').forEach(ta => {
      const i = parseInt(ta.dataset.sideTa, 10);
      _infoRenderOverlay(ta); // overløbs-farve + auto-højde + tæller
      ta.addEventListener('input', () => {
        box.sider[i] = ta.value;
        if (i === 0) box.indhold = ta.value;
        _infoDirty.add(box.id);
        _infoRenderOverlay(ta);
      });
    });
    card.querySelector('[data-side-add]')?.addEventListener('click', () => {
      if (!Array.isArray(box.sider)) box.sider = [box.indhold || ''];
      if (box.sider.length >= INFO_MAX_SIDER) return;
      box.sider.push(''); _infoDirty.add(box.id); renderInfo();
    });
    card.querySelectorAll('[data-side-del]').forEach(btn => btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.sideDel, 10);
      box.sider.splice(i, 1);
      if (!box.sider.length) box.sider = [''];
      box.indhold = box.sider[0] || '';
      _infoDirty.add(box.id); renderInfo();
    }));
    card.querySelector('[data-act="ryd"]').addEventListener('click', () => {
      box.overskrift = ''; box.sider = ['']; box.indhold = '';
      _infoDirty.add(box.id); renderInfo(); // bliver i edit-mode, felter ryddet
    });
    card.querySelector('[data-act="gem"]').addEventListener('click', async () => {
      box.editMode = false;
      try { await saveInfoBokse('Gemt ✓'); } catch { toast('Fejl ved gem', 'err'); }
      renderInfo();
    });
    card.querySelector('[data-act="annuller"]').addEventListener('click', () => {
      box.editMode = false; _infoDirty.delete(box.id);
      refreshInfo(); // genindlæs fra DB → kasser ikke-gemte ændringer
    });
  });
}

async function deleteAllInfoBokse() {
  if (!infoBokse.length) return;
  if (!confirm('Slet ALLE ' + infoBokse.length + ' info-bokse i dette projekt? Dette kan ikke fortrydes.')) return;
  infoBokse.forEach(b => { _infoDeleted.add(b.id); _infoDirty.delete(b.id); });
  infoBokse = [];
  try { await saveInfoBokse('Alle info-bokse slettet'); } catch { toast('Fejl ved slet', 'err'); }
  renderInfo();
}

async function addInfoBox() {
  const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'b' + Date.now();
  infoBokse.push({ id, overskrift: '', indhold: '', sider: [''], output: 'hoved', editMode: true });
  _infoDirty.add(id);
  try { await saveInfoBokse(); } catch { toast('Fejl ved gem', 'err'); }
  renderInfo();
}

// OUTPUT-valg fjernet (okt 2026): info vises nu via den indlejrede info-grafiks overlay_target + trigger
// (GRAFIK → INFO), ikke via per-boks output. `output`-feltet i data ignoreres (ingen migration nødvendig).
