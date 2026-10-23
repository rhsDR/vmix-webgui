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
    infoBokse.forEach(b => { if (!INFO_OUTPUT_IDS.includes(b.output)) { b.output = 'hoved'; changed = true; } });
    if (changed) { try { await saveInfoBokse(); } catch {} }
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
          <button class="btn" data-act="del" title="Slet info-boks" style="margin-left:auto;background:#2a1010;border:1px solid #4a2020;color:#ef4444;">✕ Slet</button>
        </div>
        <div class="edit-grid" style="margin-bottom:10px;">
          <div class="form-group span2">
            <label class="form-label">Overskrift</label>
            <input class="form-input" data-field="overskrift" value="${esc(b.overskrift || '')}" placeholder="Overskrift">
          </div>
          <div class="form-group span2">
            <label class="form-label">Indhold</label>
            <textarea class="form-input" data-field="indhold" rows="3" maxlength="${INFO_INDHOLD_MAX}" placeholder="Indhold (maks 3 linjer)">${esc(b.indhold || '')}</textarea>
            <div class="info-char-count" style="font-size:10px;color:#888;text-align:right;margin-top:3px;letter-spacing:.5px;">${INFO_INDHOLD_MAX - (b.indhold || '').length} tegn tilbage</div>
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
      ${infoBokse.length ? '<button class="btn" id="infoDelAll" style="background:#2a1010;border:1px solid #4a2020;color:#ef4444;margin-left:auto;">✕ Slet alle</button>' : ''}
    </div>
    <div id="infoCards" style="margin-top:14px;">${cards || '<div style="color:#8c8c8c;font-size:12px;padding:12px 0;">Ingen info-bokse endnu. Klik “＋ Tilføj info-boks”.</div>'}</div>`;

  list.querySelector('#infoAdd').addEventListener('click', addInfoBox);
  list.querySelector('#infoDelAll')?.addEventListener('click', deleteAllInfoBokse);
  list.querySelectorAll('[data-box]').forEach(card => {
    const id = card.dataset.box;
    const box = infoBokse.find(b => b.id === id);
    if (!box) return;
    card.querySelector('[data-field="overskrift"]').addEventListener('input', e => { box.overskrift = e.target.value; });
    // Info-indhold: maks 3 linjer + maks INFO_INDHOLD_MAX tegn. Enter blokeres ved 3 linjer; paste af mere
    // afkortes; tæller viser resterende tegn.
    const indholdEl = card.querySelector('[data-field="indhold"]');
    const countEl = card.querySelector('.info-char-count');
    const updateCount = () => {
      if (!countEl) return;
      const rest = INFO_INDHOLD_MAX - indholdEl.value.length;
      countEl.textContent = rest + ' tegn tilbage';
      countEl.style.color = rest <= 15 ? '#ef4444' : '#888';
    };
    indholdEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.value.split('\n').length >= 3) e.preventDefault();
    });
    indholdEl.addEventListener('input', e => {
      if (e.target.value.split('\n').length > 3) {
        const pos = e.target.selectionStart;
        e.target.value = e.target.value.split('\n').slice(0, 3).join('\n');
        const p = Math.min(pos, e.target.value.length);
        try { e.target.setSelectionRange(p, p); } catch (err) {}
      }
      box.indhold = e.target.value;
      updateCount();
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
  });
}

async function deleteAllInfoBokse() {
  if (!infoBokse.length) return;
  if (!confirm('Slet ALLE ' + infoBokse.length + ' info-bokse i dette projekt? Dette kan ikke fortrydes.')) return;
  infoBokse = [];
  try { await saveInfoBokse('Alle info-bokse slettet'); } catch { toast('Fejl ved slet', 'err'); }
  renderInfo();
}

async function addInfoBox() {
  const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'b' + Date.now();
  infoBokse.push({ id, overskrift: '', indhold: '', output: 'hoved' });
  try { await saveInfoBokse(); } catch { toast('Fejl ved gem', 'err'); }
  renderInfo();
}

// OUTPUT-valg fjernet (okt 2026): info vises nu via den indlejrede info-grafiks overlay_target + trigger
// (GRAFIK → INFO), ikke via per-boks output. `output`-feltet i data ignoreres (ingen migration nødvendig).
