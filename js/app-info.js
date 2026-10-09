// ── INFO (flere info-bokse) ───────────────────────────────────
// En liste af info-bokse, hver med overskrift + indhold + output (Ingen/Master/Secondary/
// Fullscreen). Gemmes som JSON i settings.info_bokse (pr. projekt) — ingen ny tabel.
// Hver boks rider med i sit valgte overlay-vindue; flere på samme overlay stables.
// Vis/skjul styres i vMix. Fanen er kun synlig i Projekt 2 (gating i app-init.js).

// output-mål: '' = Ingen (skjult). hoved=Master, komm=Secondary, overlay-3=Fullscreen.
const INFO_OUTPUTS = [['', 'Ingen'], ['hoved', 'Master'], ['komm', 'Secondary'], ['overlay-3', 'Fullscreen']];

async function refreshInfo() {
  try {
    const rows = await sbGet('settings?select=value&key=eq.info_bokse&projekt_id=eq.' + aktivProjektId);
    const v = rows[0] && rows[0].value ? JSON.parse(rows[0].value) : [];
    infoBokse = Array.isArray(v) ? v : [];
  } catch { infoBokse = []; }
  renderInfo();
}

async function saveInfoBokse(okMsg) {
  await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'info_bokse', value: JSON.stringify(infoBokse) });
  if (okMsg) toast(okMsg, 'ok');
}

function _infoBoxCard(b, idx) {
  const opts = INFO_OUTPUTS.map(([v, t]) => `<option value="${v}"${b.output === v ? ' selected' : ''}>${t}</option>`).join('');
  return `
    <div class="ticker-block" style="margin-bottom:12px;" data-box="${b.id}">
      <div class="ticker-body" style="display:block;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span class="ticker-num">INFO ${idx + 1}</span>
          <label class="form-label" style="margin:0 0 0 auto;">Output</label>
          <select class="form-input" data-field="output" style="width:auto;min-width:130px;">${opts}</select>
          <button class="btn btn-cancel" data-act="preview" title="Preview">▶</button>
          <button class="icon-btn" data-act="del" title="Slet info-boks">🗑</button>
        </div>
        <div class="edit-grid" style="margin-bottom:10px;">
          <div class="form-group span2">
            <label class="form-label">Overskrift</label>
            <input class="form-input" data-field="overskrift" value="${esc(b.overskrift || '')}" placeholder="Overskrift">
          </div>
          <div class="form-group span2">
            <label class="form-label">Indhold</label>
            <textarea class="form-input" data-field="indhold" rows="3" placeholder="Indhold (flere linjer tilladt)">${esc(b.indhold || '')}</textarea>
          </div>
        </div>
        <div class="edit-actions"><button class="btn btn-save" data-act="gem">💾 GEM</button></div>
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
      <span style="font-size:11px;color:#8c8c8c;margin-left:10px;max-width:520px;">Hver boks vises i sit valgte overlay-vindue (flere på samme overlay stables nedefra). Vis/skjul styres i vMix. Genindlæs overlay-kilden i vMix første gang.</span>
    </div>
    <div id="infoCards" style="margin-top:14px;">${cards || '<div style="color:#8c8c8c;font-size:12px;padding:12px 0;">Ingen info-bokse endnu. Klik “＋ Tilføj info-boks”.</div>'}</div>`;

  list.querySelector('#infoAdd').addEventListener('click', addInfoBox);
  list.querySelectorAll('[data-box]').forEach(card => {
    const id = card.dataset.box;
    const box = infoBokse.find(b => b.id === id);
    if (!box) return;
    card.querySelector('[data-field="overskrift"]').addEventListener('input', e => { box.overskrift = e.target.value; });
    card.querySelector('[data-field="indhold"]').addEventListener('input', e => { box.indhold = e.target.value; });
    card.querySelector('[data-field="output"]').addEventListener('change', async e => {
      box.output = e.target.value;
      try { await saveInfoBokse('Output gemt'); } catch { toast('Fejl ved gem', 'err'); }
    });
    card.querySelector('[data-act="gem"]').addEventListener('click', async () => {
      try { await saveInfoBokse('Gemt ✓'); } catch { toast('Fejl ved gem', 'err'); }
    });
    card.querySelector('[data-act="del"]').addEventListener('click', async () => {
      if (!confirm('Slet denne info-boks?')) return;
      infoBokse = infoBokse.filter(b => b.id !== id);
      try { await saveInfoBokse('Slettet'); } catch { toast('Fejl ved slet', 'err'); }
      renderInfo();
    });
    card.querySelector('[data-act="preview"]').addEventListener('click', () => _infoPreview(id));
  });
}

async function addInfoBox() {
  const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'b' + Date.now();
  infoBokse.push({ id, overskrift: '', indhold: '', output: '' });
  try { await saveInfoBokse(); } catch { toast('Fejl ved gem', 'err'); }
  renderInfo();
}

function _infoPreview(id) {
  const modal = document.getElementById('previewModal');
  const frame = document.getElementById('previewFrame');
  frame.src = 'info.html?preview=1&p=' + aktivProjektId + '&box=' + encodeURIComponent(id) + '&t=' + Date.now();
  modal.style.display = 'flex';
  requestAnimationFrame(() => {
    const inner = modal.querySelector('.preview-modal-inner');
    const scale = inner.offsetWidth / 1920;
    frame.style.cssText = `width:1920px;height:1080px;border:none;transform:scale(${scale});transform-origin:top left;`;
  });
}
