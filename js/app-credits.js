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
    const lagRow     = settingsRaw.find(r => r.key === 'overlay_lag_order');
    creditsTriggerActive = triggerRow ? triggerRow.value === 'in' : false;
    if (lagRow && lagRow.value) {
      overlayLagOrder = lagRow.value.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      overlayLagOrder = [...DEFAULT_LAG_ORDER];
    }
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
      <span style="font-size:11px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">https://vmix-control.vercel.app/credits.html?p=${aktivProjektId}</span>
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
    requestAnimationFrame(() => {
      const inner = modal.querySelector('.preview-modal-inner');
      const scale = inner.offsetWidth / 1920;
      frame.style.cssText = `width:1920px;height:1080px;border:none;transform:scale(${scale});transform-origin:top left;`;
    });
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
