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
    row.innerHTML = `
      <span class="sub-num">${slot}</span>
      <span class="sub-text ${hasData ? '' : 'empty'}">${hasData
        ? `<span class="sub-navn">${esc(s.navn)}</span><span class="sub-titel">${esc(s.titel)}</span>`
        : '—'}</span>
      <button class="icon-btn" id="seb-${i}" title="Rediger">✏️</button>`;
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

