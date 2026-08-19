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
      ${hasEnetNavn ? `<input class="stamdata-input sd-edit-enet"  value="${esc(item.enetNavn)}" placeholder="Enetpulse navn"   style="flex:2;">` : ''}
      <button class="stamdata-btn sd-save">Gem</button>
      <button class="stamdata-del sd-cancel" title="Annuller">✕</button>
    `;
    const langInput  = row.querySelector('.sd-edit-lang');
    const kortInput  = row.querySelector('.sd-edit-kort');
    const titelInput = row.querySelector('.sd-edit-titel');
    const enetInput  = row.querySelector('.sd-edit-enet');
    langInput.focus();

    row.querySelector('.sd-save').addEventListener('click', async () => {
      const newLang     = langInput.value.trim();
      const newKort     = kortInput  ? kortInput.value.trim()  : null;
      const newTitel    = titelInput ? titelInput.value.trim() : null;
      const newEnetNavn = enetInput  ? enetInput.value.trim()  : null;
      if (!newLang) return;
      row.querySelector('.sd-save').disabled = true;
      const body = { lang: newLang };
      if (newKort     !== null) body.kort     = newKort;
      if (newTitel    !== null) body.titel    = newTitel;
      if (newEnetNavn !== null) body.enet_navn = newEnetNavn || null;
      await sbPatch('dropdowns?id=eq.' + item.id, body);
      item.label   = newLang;
      if (newKort     !== null) item.kort     = newKort;
      if (newTitel    !== null) item.titel    = newTitel;
      if (newEnetNavn !== null) item.enetNavn = newEnetNavn;
      await refreshDropdowns();
    });

    row.querySelector('.sd-cancel').addEventListener('click', showView);

    const inputs = [langInput, kortInput, titelInput, enetInput].filter(Boolean);
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

async function addStamdataItem(type, lang, kort, titel = null, enetNavn = null) {
  if (!lang.trim()) return;
  const orden = stamdataRaw.filter(r => r.type === type).length + 1;
  const body = { type, lang: lang.trim(), orden };
  if (kort !== null) body.kort = kort.trim();
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
  renderStamdataSection('hold',        'sdHoldList', r => ({ label: r.lang, kort: r.kort, enetNavn: r.enet_navn || '', id: r.id }));
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
    await addStamdataItem('kommentator', input.value, null, titelInput.value.trim() || null);
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
    const enet = document.getElementById('sdHoldEnetInput');
    if (!lang.value.trim()) return;
    sdHoldBtn.disabled = true;
    await addStamdataItem('hold', lang.value, kort.value, null, enet.value.trim() || null);
    lang.value = ''; kort.value = ''; enet.value = '';
    sdHoldBtn.disabled = false;
    lang.focus();
  });
  document.getElementById('sdHoldLangInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('sdHoldKortInput').focus();
  });
  document.getElementById('sdHoldKortInput').addEventListener('keydown', e => {
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

