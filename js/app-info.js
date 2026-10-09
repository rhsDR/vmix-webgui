// ── INFO (flere info-bokse) ───────────────────────────────────
// En liste af info-bokse, hver med overskrift + indhold + output (Ingen/Master/Secondary/
// Fullscreen). Gemmes som JSON i settings.info_bokse (pr. projekt) — ingen ny tabel.
// Tekst redigeres i INFO-fanen; OUTPUT vælges UDELUKKENDE under GRAFIK SETUP (INFO-BOKSE).
// Hver boks rider med i sit valgte overlay-vindue; flere på samme overlay stables.
// Vis/skjul styres i vMix. Fanen er kun synlig i Projekt 2 (gating i app-init.js).

// output-mål: '' = Ingen (skjult). hoved=Master, komm=Secondary, overlay-3=Fullscreen.
const INFO_OUTPUTS = [['', 'Ingen'], ['hoved', 'Master'], ['komm', 'Secondary'], ['overlay-3', 'Fullscreen']];

async function loadInfoBokse() {
  try {
    const rows = await sbGet('settings?select=value&key=eq.info_bokse&projekt_id=eq.' + aktivProjektId);
    const v = rows[0] && rows[0].value ? JSON.parse(rows[0].value) : [];
    infoBokse = Array.isArray(v) ? v : [];
  } catch { infoBokse = []; }
}

async function refreshInfo() { await loadInfoBokse(); renderInfo(); }

async function saveInfoBokse(okMsg) {
  await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'info_bokse', value: JSON.stringify(infoBokse) });
  if (okMsg) toast(okMsg, 'ok');
}

// ── INFO-fanen (kun tekst — INGEN output her) ──
function _infoBoxCard(b, idx) {
  return `
    <div class="ticker-block" style="margin-bottom:12px;" data-box="${b.id}">
      <div class="ticker-body" style="display:block;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span class="ticker-num">INFO ${idx + 1}</span>
          <button class="btn btn-cancel" data-act="preview" title="Preview" style="margin-left:auto;">▶ PREVIEW</button>
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
      <span style="font-size:11px;color:#8c8c8c;margin-left:10px;max-width:520px;">Skriv overskrift + indhold. <b>Output (hvilket overlay boksen ligger på) vælges under GRAFIK SETUP → INFO-BOKSE.</b> Vis/skjul styres i vMix.</span>
    </div>
    <div id="infoCards" style="margin-top:14px;">${cards || '<div style="color:#8c8c8c;font-size:12px;padding:12px 0;">Ingen info-bokse endnu. Klik “＋ Tilføj info-boks”.</div>'}</div>`;

  list.querySelector('#infoAdd').addEventListener('click', addInfoBox);
  list.querySelectorAll('[data-box]').forEach(card => {
    const id = card.dataset.box;
    const box = infoBokse.find(b => b.id === id);
    if (!box) return;
    card.querySelector('[data-field="overskrift"]').addEventListener('input', e => { box.overskrift = e.target.value; });
    card.querySelector('[data-field="indhold"]').addEventListener('input', e => { box.indhold = e.target.value; });
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

// ── OUTPUT-valg (KUN her: GRAFIK SETUP → INFO-BOKSE) ──
async function setInfoBoxOutput(id, val) {
  const b = infoBokse.find(x => x.id === id);
  if (!b) return;
  b.output = val;
  try { await saveInfoBokse('Output gemt'); } catch { toast('Fejl ved gem af output', 'err'); }
}

// Sektion der indlejres i renderGrafikOps (GRAFIK SETUP). Tom hvis ingen info-bokse.
function infoBokseSetupHTML() {
  if (!Array.isArray(infoBokse) || !infoBokse.length) return '';
  const rows = infoBokse.map((b, i) => {
    const label = esc(b.overskrift || ('Info ' + (i + 1)));
    const opts = INFO_OUTPUTS.map(([v, t]) => `<option value="${v}"${b.output === v ? ' selected' : ''}>${t}</option>`).join('');
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #1a1a1a;">
      <span style="flex:1;font-size:12px;color:#eee;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span>
      <select class="form-input" data-info-out="${b.id}" style="width:auto;min-width:140px;">${opts}</select>
    </div>`;
  }).join('');
  return `
    <details class="gops-section" style="margin-top:14px;">
      <summary class="gops-summary">INFO-BOKSE <span class="gops-summary-hint">— vælg output (overlay) pr. boks</span></summary>
      <div style="font-size:11px;color:#8c8c8c;margin:6px 0 10px;">Vælg hvilket overlay-vindue hver info-boks skal ligge i. Teksten redigeres i INFO-fanen. Genindlæs overlay-kilden i vMix første gang.</div>
      <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:8px 12px;">${rows}</div>
    </details>`;
}

function wireInfoBokseSetup(root) {
  root.querySelectorAll('[data-info-out]').forEach(sel => {
    sel.addEventListener('change', () => setInfoBoxOutput(sel.dataset.infoOut, sel.value));
  });
}
