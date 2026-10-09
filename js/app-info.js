// ── INFO (on-air info-boks) ───────────────────────────────────
// Helt enkel fane: skriv overskrift + indhold og gem. Grafikken (info.html) viser teksten
// og opdaterer den live. VISNINGEN on/off styres i vMix (browser-kilden lægges på/tages af
// som et almindeligt overlay) — ingen ON AIR-knap i panelet.
// Data i settings-tabellen (info_overskrift / info_indhold), pr. projekt.
// Fanen er kun synlig i Projekt 2 (gating i app-init.js).

async function refreshInfo() {
  try {
    const rows = await sbGet('settings?select=key,value&projekt_id=eq.' + aktivProjektId);
    const get = k => { const r = rows.find(x => x.key === k); return r ? (r.value || '') : ''; };
    infoData.overskrift = get('info_overskrift');
    infoData.indhold    = get('info_indhold');
  } catch { /* stille */ }
  renderInfo();
}

function renderInfo() {
  const list = document.getElementById('infoList');
  if (!list) return;
  const d = infoData;
  const url = 'https://vmix-control.vercel.app/info.html?p=' + aktivProjektId;

  list.innerHTML = `
    <div class="credits-speed-bar">
      <span style="font-size:12px;color:#8c8c8c;">Læg URL'en i vMix som Browser-input. Vis/skjul styres i vMix.</span>
      <button class="btn btn-cancel" id="infoPreviewBtn" style="margin-left:auto;">▶ PREVIEW</button>
      <div style="display:flex;align-items:center;gap:6px;background:#0d0d0d;border:1px solid #2e2e2e;border-radius:6px;padding:5px 10px;max-width:360px;overflow:hidden;">
        <span style="font-size:11px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">${url}</span>
        <button class="copy-btn icon-btn" id="infoUrlCopy" title="Kopiér link">⎘</button>
      </div>
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

  list.querySelector('#infoOverskrift').addEventListener('input', e => { infoData.overskrift = e.target.value; });
  list.querySelector('#infoIndhold').addEventListener('input', e => { infoData.indhold = e.target.value; });
  list.querySelector('#infoGem').addEventListener('click', saveInfo);
  list.querySelector('#infoUrlCopy').addEventListener('click', () => copyText(url));
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
