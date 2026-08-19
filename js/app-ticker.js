function tickerKlarTilOnAir(i) {
  const t = tickers[i];
  return t.overskrift && t.tekst;
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

