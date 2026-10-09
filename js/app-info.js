// ── INFO (on-air info-boks) ───────────────────────────────────
// Enkel fane: skriv overskrift + indhold, vælg hvilket overlay-vindue boksen skal ligge i.
// INFO-boksen rider med i det valgte overlay-vindue (Master/Secondary/Fullscreen) — ingen
// separat vMix-kilde. Vis/skjul styres i vMix ved at vise/skjule det overlay.
// Data i settings-tabellen (info_overskrift / info_indhold / info_output), pr. projekt.
// Fanen er kun synlig i Projekt 2 (gating i app-init.js).

// overlay-mål -> label (matcher composer/projekt_grafik: hoved=Master, komm=Secondary, overlay-3=Fullscreen)
const INFO_OUTPUTS = [['hoved', 'Master'], ['komm', 'Secondary'], ['overlay-3', 'Fullscreen']];

async function refreshInfo() {
  try {
    const rows = await sbGet('settings?select=key,value&projekt_id=eq.' + aktivProjektId);
    const get = k => { const r = rows.find(x => x.key === k); return r ? (r.value || '') : ''; };
    infoData.overskrift = get('info_overskrift');
    infoData.indhold    = get('info_indhold');
    infoData.output     = get('info_output') || 'hoved';
  } catch { /* stille */ }
  renderInfo();
}

function renderInfo() {
  const list = document.getElementById('infoList');
  if (!list) return;
  const d = infoData;
  const opts = INFO_OUTPUTS.map(([v, t]) => `<option value="${v}"${d.output === v ? ' selected' : ''}>${t}</option>`).join('');

  list.innerHTML = `
    <div class="credits-speed-bar">
      <label class="form-label" style="margin:0 6px 0 0;">Output</label>
      <select class="form-input" id="infoOutput" style="width:auto;min-width:150px;">${opts}</select>
      <span style="font-size:11px;color:#8c8c8c;max-width:360px;">Boksen vises i dette overlay-vindue. Vis/skjul styres i vMix. Genindlæs overlay-kilden i vMix første gang.</span>
      <button class="btn btn-cancel" id="infoPreviewBtn" style="margin-left:auto;">▶ PREVIEW</button>
    </div>
    <div class="ticker-block" style="margin-top:14px;">
      <div class="ticker-body" style="display:block;">
        <div class="edit-grid" style="margin-bottom:10px;">
          <div class="form-group span2">
            <label class="form-label">Overskrift</label>
            <input class="form-input" id="infoOverskrift" value="${esc(d.overskrift)}" placeholder="Overskrift">
          </div>
          <div class="form-group span2">
            <label class="form-label">Indhold</label>
            <textarea class="form-input" id="infoIndhold" rows="4" placeholder="Indhold (flere linjer tilladt)">${esc(d.indhold)}</textarea>
          </div>
        </div>
        <div class="edit-actions">
          <button class="btn btn-save" id="infoGem">💾 GEM</button>
        </div>
      </div>
    </div>`;

  list.querySelector('#infoOutput').addEventListener('change', e => saveInfoOutput(e.target.value));
  list.querySelector('#infoOverskrift').addEventListener('input', e => { infoData.overskrift = e.target.value; });
  list.querySelector('#infoIndhold').addEventListener('input', e => { infoData.indhold = e.target.value; });
  list.querySelector('#infoGem').addEventListener('click', saveInfo);
  list.querySelector('#infoPreviewBtn').addEventListener('click', () => {
    const modal = document.getElementById('previewModal');
    const frame = document.getElementById('previewFrame');
    frame.src = 'info.html?preview=1&p=' + aktivProjektId + '&t=' + Date.now();
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      const inner = modal.querySelector('.preview-modal-inner');
      const scale = inner.offsetWidth / 1920;
      frame.style.cssText = `width:1920px;height:1080px;border:none;transform:scale(${scale});transform-origin:top left;`;
    });
  });
}

async function saveInfo() {
  try {
    await Promise.all([
      sbUpsert('settings', { projekt_id: aktivProjektId, key: 'info_overskrift', value: infoData.overskrift }),
      sbUpsert('settings', { projekt_id: aktivProjektId, key: 'info_indhold',   value: infoData.indhold })
    ]);
    toast('Gemt ✓', 'ok');
  } catch { toast('Fejl ved gem', 'err'); }
}

async function saveInfoOutput(val) {
  infoData.output = val;
  const label = (INFO_OUTPUTS.find(o => o[0] === val) || [, val])[1];
  try {
    await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'info_output', value: val });
    toast('Output: ' + label, 'ok');
  } catch { toast('Fejl ved gem af output', 'err'); }
}
