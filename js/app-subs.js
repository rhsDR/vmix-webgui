// ── SUBS RENDER ───────────────────────────────────────────────
function renderSubs() {
  const container = document.getElementById('subsList');
  if (!container) return;
  // TV: helt egen layout (kun subs + preview + vMix-link-felter). Kampdag-grenen nedenfor er URØRT.
  if (typeof projektType !== 'undefined' && projektType === 'tv') return renderSubsTV();
  container.innerHTML = '';

  // Top-bar: Ryd alt — nulstiller navn/titel/side for ALLE subs + vMix Calls (i TV ryddes vMix Call-link også).
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:14px;';
  bar.innerHTML = '<button class="btn" id="subsClearAll" style="background:#2a1010;border:1px solid #4a2020;color:#ef4444;">✕ Ryd alt</button>';
  bar.querySelector('#subsClearAll').addEventListener('click', clearAllSubs);
  container.appendChild(bar);

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

function rerenderSub(i) {
  const old = document.getElementById('sub-' + i);
  if (old) old.replaceWith(buildSubRow(i));
}

// Nulstil ALLE subs + vMix Calls (navn/titel/side). Bulk-PATCH pr. tabel (uden slot-filter = alle rækker
// for projektet). vMix Call-links (kampdag-synkede) bevares. Realtime-UPDATE synker andre åbne paneler.
async function clearAllSubs() {
  if (!confirm('Ryd ALLE subs og vMix Calls?\n\nNavn, titel og side nulstilles for alle. Dette kan ikke fortrydes.')) return;
  // TV-projekter har INGEN kampdag-tilknytning → ryd også vMix Call-link'et. (Kun kampdag beholder link'et,
  // da det dér er synket til kampens vMix Call.)
  const isTv = (typeof projektType !== 'undefined' && projektType === 'tv');
  const vmcBody = isTv ? { navn: '', titel: '', side: 'venstre', link: '' } : { navn: '', titel: '', side: 'venstre' };
  try {
    await Promise.all([
      sbPatch('subs?projekt_id=eq.' + aktivProjektId, { navn: '', titel: '', side: 'venstre' }),
      sbPatch('vmix_calls?projekt_id=eq.' + aktivProjektId, vmcBody),
    ]);
    subs.forEach(s => { s.navn = ''; s.titel = ''; s.side = 'venstre'; s.editMode = false; });
    vmixCalls.forEach(c => { c.navn = ''; c.titel = ''; c.side = 'venstre'; c.editMode = false; if (isTv) c.link = ''; });
    renderSubs();
    toast('Alle subs og vMix Calls ryddet', 'ok');
  } catch { toast('Fejl ved rydning', 'err'); }
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
        <select class="form-input" id="ss-${i}" title="Hvilken side grafikken vises i">
          <option value="venstre"${(s.buf.side || 'venstre') === 'venstre' ? ' selected' : ''}>Venstre side</option>
          <option value="hojre"${(s.buf.side || 'venstre') === 'hojre' ? ' selected' : ''}>Højre side</option>
        </select>
      </div>
      <div class="sub-actions">
        <button class="btn-sm save"   id="sg-${i}">GEM</button>
        <button class="btn-sm cancel" id="sa-${i}">ANNULLER</button>
        <button class="btn-sm reset"  id="sr-${i}">RYD</button>
      </div>`;
    row.querySelector('#sn-' + i).addEventListener('input',  e => { s.buf.navn  = e.target.value; });
    row.querySelector('#st-' + i).addEventListener('input',  e => { s.buf.titel = e.target.value; });
    row.querySelector('#ss-' + i).addEventListener('change', e => { s.buf.side  = e.target.value; });
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
    row.innerHTML = `
      <span class="sub-num">${slot}</span>
      <span class="sub-text ${hasData ? '' : 'empty'}">${hasData
        ? `<span class="sub-navn">${esc(s.navn)}</span><span class="sub-titel">${esc(s.titel)}</span>`
        : '—'}</span>
      <span class="sub-side-tag" title="Side" style="font-size:11px;font-weight:600;letter-spacing:1px;color:#93c5fd;background:#15243a;border:1px solid #2d4a6a;border-radius:4px;padding:2px 8px;flex-shrink:0;">${(s.side || 'venstre') === 'hojre' ? 'HØJRE' : 'VENSTRE'}</span>
      <button class="icon-btn" id="seb-${i}" title="Rediger">✏️</button>`;
    row.querySelector('#seb-' + i).addEventListener('click', () => {
      s.buf = { navn: s.navn, titel: s.titel, side: s.side || 'venstre' };
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
        <select class="form-input" id="vcs-${i}" title="Hvilken side grafikken vises i">
          <option value="venstre"${(c.buf.side || 'venstre') === 'venstre' ? ' selected' : ''}>Venstre side</option>
          <option value="hojre"${(c.buf.side || 'venstre') === 'hojre' ? ' selected' : ''}>Højre side</option>
        </select>
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
    row.querySelector('#vcs-'  + i).addEventListener('change', e => { c.buf.side = e.target.value; });
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
      ${!kampBruger ? `<span class="sub-side-tag" title="Side" style="font-size:11px;font-weight:600;letter-spacing:1px;color:#93c5fd;background:#15243a;border:1px solid #2d4a6a;border-radius:4px;padding:2px 8px;flex-shrink:0;">${(c.side || 'venstre') === 'hojre' ? 'HØJRE' : 'VENSTRE'}</span>` : ''}
      ${!kampBruger ? `<button class="icon-btn" id="vceb-${i}" title="Rediger">✏️</button>` : ''}
      <button class="icon-btn vmix-col-btn" id="vccol-${i}" title="Fold ind"><i class="collapse-arrow">▴</i></button>`;
    const colBtn = row.querySelector('#vccol-' + i);
    if (colBtn) colBtn.addEventListener('click', () => { c.collapsed = true; rerenderVmixCall(i); });

    if (!kampBruger) {
      const cpBtn = row.querySelector('#vccp2-' + i);
      if (cpBtn) cpBtn.addEventListener('click', () => copyText(c.link));
      const ebBtn = row.querySelector('#vceb-' + i);
      if (ebBtn) ebBtn.addEventListener('click', () => {
        c.buf = { navn: c.navn, titel: c.titel, link: c.link, side: c.side || 'venstre' };
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
  s.side  = s.buf.side || 'venstre';
  s.editMode = false;
  s.savePending = true;
  rerenderSub(i);
  try {
    // PATCH (kampdag-identisk) med INSERT-fallback: pladser 1-15 er seedet og nye TV-pladser oprettes som tom
    // række i _tvAddSub, så PATCH rammer normalt en eksisterende række. MEN en TV-plads tilføjet FØR INSERT-
    // fixen har ingen række → PATCH rammer 0 rækker og gemmer intet. Derfor: ser vi 0 opdaterede rækker,
    // INSERT'er vi pladsen (self-healing). Kampdag (1-15 findes altid) rammer altid >0 → aldrig INSERT.
    // (sbUpsert kan IKKE bruges: den stripper slot fra body — lavet til settings — så subs ville gemmes uden plads.)
    const _patched = await sbPatch('subs?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { navn: s.navn, titel: s.titel, side: s.side }, true);
    if (Array.isArray(_patched) && _patched.length === 0) {
      await sbPost('subs', { projekt_id: aktivProjektId, slot: i + 1, navn: s.navn, titel: s.titel, side: s.side });
    }
    toast('Gemt ✓', 'ok');
    flashSaved(document.getElementById('sub-' + i), 'blue');
  } catch (e) { console.error('[saveSubRow] fejl ved gem af sub plads ' + (i + 1) + ':', e); toast('Fejl ved gem', 'err'); }
  finally { s.savePending = false; }
}

async function saveVmixCallRow(i) {
  const c = vmixCalls[i];
  c.navn  = c.buf.navn;
  c.titel = c.buf.titel;
  c.link  = c.buf.link;
  c.side  = c.buf.side || 'venstre';
  c.editMode = false;
  c.savePending = true;
  rerenderVmixCall(i);
  try {
    await sbPatch('vmix_calls?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { navn: c.navn, titel: c.titel, link: c.link, side: c.side });
    toast('Gemt ✓', 'ok');
    flashSaved(document.getElementById('vcall-' + i), 'purple');
    // Synk link til kamp slot
    // KUN kampdag synker vMix Call-link til kampen. TV-projekter må aldrig røre kampe-tabellen → TV og
    // kampdag virker uafhængigt af hinanden.
    if (projektType === 'kampdag' && i < 6 && kampe[i]) {
      kampe[i].vmixcall     = c.link;
      kampe[i].buf.vmixcall = c.link;
      await sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { vmixcall: c.link });
      rerender(i);
    }
  } catch { toast('Fejl ved gem', 'err'); }
  finally { c.savePending = false; }
}

// ───────────────────────────────────────────────────────────────────────────
// TV-LAYOUT (KUN projektType==='tv'). Kampdag bruger renderSubs ovenfor uændret.
// Kun subs (ingen vMix-Calls-som-subs) + live preview-vindue + 8 rå vMix Call-link-felter.
// Alt herunder er additivt og kaldes ALDRIG i kampdag.
// ───────────────────────────────────────────────────────────────────────────

// Dynamiske subs (TV): tvSubs = liste af AKTIVE plads-numre (ubegrænset). Gemt i settings.tv_subs.
// Pladserne er slot-STABILE: slet = hul, tilføj = laveste frie nummer (genbrug). Kampdag rører den ALDRIG.
// Default [1..15] så SUBS-fanen ikke flasher tom før loadTvSubs henter den rigtige liste.
let tvSubs = Array.from({ length: 15 }, (_, i) => i + 1);
function _ensureSubsPadded() {
  const maxSlot = Math.max(15, ...(tvSubs.length ? tvSubs : [15]));
  while (subs.length < maxSlot) subs.push(makeSub());
}
async function loadTvSubs() {
  if (typeof projektType === 'undefined' || projektType !== 'tv') return;   // KUN TV
  try {
    const rows = await sbGet('settings?select=value&key=eq.tv_subs&projekt_id=eq.' + aktivProjektId);
    const v = rows[0] && rows[0].value ? JSON.parse(rows[0].value) : null;
    tvSubs = (Array.isArray(v) && v.length) ? v.filter(n => Number.isInteger(n) && n >= 1) : Array.from({ length: 15 }, (_, i) => i + 1);
  } catch { tvSubs = Array.from({ length: 15 }, (_, i) => i + 1); }
  _ensureSubsPadded();
}
async function saveTvSubs(okMsg) {
  try {
    await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'tv_subs', value: JSON.stringify(tvSubs) });
    if (okMsg) toast(okMsg, 'ok');
  } catch { toast('Fejl ved gem', 'err'); }
}
async function _tvAddSub() {
  let slot = 1; const used = new Set(tvSubs);     // laveste frie nummer (genbrug huller), intet loft
  while (used.has(slot)) slot++;
  tvSubs.push(slot);
  _ensureSubsPadded();
  // Opret en tom række for den nye plads, så saveSubRow's PATCH rammer en eksisterende række ved første gem.
  // Add rammer altid en FRI plads (ikke i tvSubs) → den har ingen række → ingen dublet.
  try { await sbPost('subs', { projekt_id: aktivProjektId, slot: slot, navn: '', titel: '', side: 'venstre' }); }
  catch (e) { console.error('[_tvAddSub] INSERT fejl for plads ' + slot + ':', e); toast('Kunne ikke oprette sub ' + slot + ' i databasen', 'err'); }
  await saveTvSubs();
  renderSubsTV();
}
async function _tvDeleteSub(slot) {
  const s = subs[slot - 1];
  const hasData = s && ((s.navn || '').trim() || (s.titel || '').trim());
  if (hasData && !confirm('Slet sub ' + slot + '?')) return;
  tvSubs = tvSubs.filter(n => n !== slot);
  if (s) { s.navn = ''; s.titel = ''; s.side = 'venstre'; s.editMode = false; if (s.buf) { s.buf.navn = ''; s.buf.titel = ''; } }
  await saveTvSubs();
  try { await sbDelete('subs?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + slot); } catch {}
  renderSubsTV();
}

function renderSubsTV() {
  const container = document.getElementById('subsList');
  if (!container) return;
  container.innerHTML = '';

  // Top-bar: Ryd alt (genbruger clearAllSubs — den håndterer allerede TV korrekt)
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:14px;';
  bar.innerHTML = '<button class="btn" id="subsClearAll" style="background:#2a1010;border:1px solid #4a2020;color:#ef4444;">✕ Ryd alt</button>';
  bar.querySelector('#subsClearAll').addEventListener('click', clearAllSubs);
  container.appendChild(bar);

  const grid = document.createElement('div');
  grid.className = 'subs-tv';

  // Venstre kolonne: KUN subs
  const main = document.createElement('div');
  main.className = 'subs-tv-main';

  // Subs-sektion — GENBRUGER buildSubRow uændret (navn/titel/side, GEM/ANNULLER/RYD)
  const secSubs = document.createElement('div');
  secSubs.className = 'subs-section';
  secSubs.innerHTML = '<div class="subs-section-title" style="color:var(--blue)">Subs</div>';
  const subsList = document.createElement('div');
  subsList.id = 'subsTvList';
  // Vis KUN de aktive pladser (tvSubs), sorteret. Hver buildSubRow(slot-1) pakkes i en wrap med en ✕ slet,
  // så rerenderSub (ved edit) kun udskifter selve rækken — slet-knappen bliver stående. buildSubRow er URØRT.
  _ensureSubsPadded();
  (tvSubs || []).slice().sort((a, b) => a - b).forEach(slot => {
    const wrap = document.createElement('div');
    wrap.className = 'sub-tv-wrap';
    wrap.appendChild(buildSubRow(slot - 1));
    const del = document.createElement('button');
    del.className = 'icon-btn sub-tv-del';
    del.title = 'Slet sub ' + slot;
    del.textContent = '🗑';
    del.addEventListener('click', () => _tvDeleteSub(slot));
    wrap.appendChild(del);
    subsList.appendChild(wrap);
  });
  secSubs.appendChild(subsList);
  const addBtn = document.createElement('button');
  addBtn.className = 'btn sub-tv-add';
  addBtn.textContent = '＋ Tilføj sub';
  addBtn.addEventListener('click', _tvAddSub);
  secSubs.appendChild(addBtn);
  main.appendChild(secSubs);

  grid.appendChild(main);

  // Højre kolonne: preview-vindue + vMix Call-links UNDER preview
  const prev = document.createElement('div');
  prev.className = 'subs-tv-preview';
  prev.innerHTML =
    '<div class="subs-section-title" style="color:#9aa5b5">Preview</div>'
    + '<div class="subs-tv-preview-box"><iframe id="subPreviewFrame" class="subs-tv-preview-iframe"></iframe></div>'
    + '<div class="subs-tv-preview-hint">Klik en sub for at se den — eller rediger, så opdateres preview mens du skriver.</div>';

  // vMix Call-links-sektion — 8 faste felter (kun link + kopiér), under preview
  const secLinks = document.createElement('div');
  secLinks.className = 'subs-section';
  secLinks.style.marginTop = '24px';
  secLinks.innerHTML = '<div class="subs-section-title" style="color:#a855f7">vMix Call-links</div>';
  const linksWrap = document.createElement('div');
  linksWrap.id = 'vlinksList';
  vmixCalls.forEach((_, i) => linksWrap.appendChild(buildVmixLinkRow(i)));
  secLinks.appendChild(linksWrap);
  prev.appendChild(secLinks);

  grid.appendChild(prev);

  container.appendChild(grid);

  // Live preview via container-delegation (rører IKKE buildSubRow):
  //  • klik på en sub-række → vis den (gemt data, eller buffer hvis i edit-mode)
  //  • skriv i edit-felterne → opdater preview (debounced) — kun postMessage, ingen gen-animation
  const _idxFromEvent = e => {
    const r = e.target.closest('.sub-row'); if (!r) return null;
    const n = parseInt(String(r.id).replace('sub-', ''), 10);
    return isNaN(n) ? null : n;
  };
  subsList.addEventListener('click', e => {
    const i = _idxFromEvent(e); if (i == null) return;
    const s = subs[i]; const d = (s.editMode && s.buf) ? s.buf : s;
    _subPreviewShow(i + 1, { navn: d.navn, titel: d.titel, side: d.side || 'venstre' });
  });
  let _prvDebT = null;
  subsList.addEventListener('input', e => {
    const i = _idxFromEvent(e); if (i == null) return;
    clearTimeout(_prvDebT);
    _prvDebT = setTimeout(() => {
      const s = subs[i]; const d = s.buf || s;
      _subPreviewShow(i + 1, { navn: d.navn, titel: d.titel, side: d.side || 'venstre' });
    }, 150);
  });
}

function buildVmixLinkRow(i) {
  const c   = vmixCalls[i] || {};
  const row = document.createElement('div');
  row.className = 'subs-tv-link-row';
  row.innerHTML = `
    <span class="subs-tv-link-num">vMix Call ${i + 1}</span>
    <input class="form-input subs-tv-link-input" id="vlink-${i}" value="${esc(c.link || '')}" placeholder="Indsæt vMix Call-link">
    <button class="copy-btn icon-btn" id="vlinkcp-${i}" title="Kopiér link">⎘</button>`;
  const inp = row.querySelector('#vlink-' + i);
  inp.addEventListener('change', () => saveVmixLinkTV(i, inp.value));
  inp.addEventListener('blur',   () => saveVmixLinkTV(i, inp.value));
  row.querySelector('#vlinkcp-' + i).addEventListener('click', () => copyText(inp.value));
  return row;
}

// Realtime: opdater ét link-felt (uden at afbryde aktiv indtastning). Kaldes KUN i TV fra app-realtime.
function rerenderVmixLinkTV(i) {
  const inp = document.getElementById('vlink-' + i);
  if (!inp || inp === document.activeElement) return;
  inp.value = (vmixCalls[i] && vmixCalls[i].link) || '';
}

// Gem KUN link-feltet. Rører ALDRIG navn/titel/side eller kampe-tabellen → fuldt kampdag-isoleret.
async function saveVmixLinkTV(i, url) {
  const c = vmixCalls[i];
  url = (url || '').trim();
  if ((c.link || '') === url) return;
  c.link = url;
  try {
    await sbPatch('vmix_calls?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), { link: url });
    toast('Link gemt ✓', 'ok');
  } catch { toast('Fejl ved gem', 'err'); }
}

// Projektets sub-grafik (kategori 'sub') → file_url til preview. SUBS er default-fane i TV (før grafik-
// fanen er åbnet, så customGrafik kan være tom) → fald tilbage til en direkte sbGet.
async function _subGrafikUrl() {
  const g = (typeof customGrafik !== 'undefined' ? customGrafik : []).find(x => x.kategori === 'sub');
  if (g) return g.file_url;
  try {
    const rows = await sbGet('projekt_grafik?projekt_id=eq.' + aktivProjektId + '&kategori=eq.sub&limit=1&select=file_url');
    return (rows && rows[0]) ? rows[0].file_url : '';
  } catch { return ''; }
}

// Preview-state (lokal til SUBS-fanen).
let _subPrvUrl = '';
let _subPrvLoaded = false;
let _subPrvActiveSlot = null;
let _subPrvPending = null;

// Vis en sub i preview-iframen. Skift til en anden sub → runAnimationIN; samme sub (skriv) → kun
// postMessage (live tekst-skift). 100% LOKAL (postMessage til egen iframe) — rører ALDRIG active_sub
// eller den live sub-grafik på air. __IS_PREVIEW=true → grafikken henter IKKE /api/vmix (ingen race
// med min buffer); cachen fyldes udelukkende af det jeg pusher.
async function _subPreviewShow(slot, data) {
  const f = document.getElementById('subPreviewFrame');
  if (!f) return;
  const url = await _subGrafikUrl();
  if (!url) return;
  data = data || {};
  const msg = { type: 'vmixData', kind: 'sub', slot: String(slot),
    navn: data.navn || '', titel: data.titel || '', side: data.side || 'venstre' };

  if (_subPrvLoaded && _subPrvUrl === url && f.contentWindow) {
    try { f.contentWindow.postMessage(msg, '*'); } catch {}
    if (_subPrvActiveSlot !== String(slot)) {
      _subPrvActiveSlot = String(slot);
      try { f.contentWindow.runAnimationIN && f.contentWindow.runAnimationIN(String(slot)); } catch {}
    }
    return;
  }

  // Indlæs grafikken ÉN gang; postMessage + IN sker i onload.
  _subPrvPending = { slot: String(slot), msg };
  const origin = window.location.origin, pid = aktivProjektId;
  let html = '';
  try { html = await fetch(url, { cache: 'no-store' }).then(r => r.text()); } catch { return; }
  const _ffCss = (typeof fontLib !== 'undefined' ? (fontLib || []) : [])
    .map(x => (typeof _fontFaceCss === 'function') ? _fontFaceCss(x) : '').filter(Boolean).join('');
  const boot = `window.__PROJEKT_ID=${JSON.stringify(pid || '')};window.__API_ORIGIN=${JSON.stringify(origin)};window.__IS_PREVIEW=true;`;
  const inject = `<link rel="stylesheet" href="${origin}/fonts.css"><style>${_ffCss}</style><script>${boot}<\/script>`;
  const doc = html.replace(/(<html[^>]*>)/i, '$1' + inject);
  f.onload = function () {
    _subPrvLoaded = true; _subPrvUrl = url; _subPrvActiveSlot = null;
    const p = _subPrvPending; _subPrvPending = null;
    if (!p || !f.contentWindow) return;
    try { f.contentWindow.postMessage(p.msg, '*'); } catch {}
    _subPrvActiveSlot = p.slot;
    setTimeout(() => { try { f.contentWindow && f.contentWindow.runAnimationIN && f.contentWindow.runAnimationIN(p.slot); } catch {} }, 250);
  };
  f.removeAttribute('src');
  f.srcdoc = doc.includes('__PROJEKT_ID') ? doc : inject + html;
}

