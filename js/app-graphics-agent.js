// ── GRAFIK-AGENT ───────────────────────────────────────────────
// AI-assistent der interviewer operatøren og enten KONFIGURERER en uploadet HTML-grafik,
// GENERERER en ny, eller REVIDERER en eksisterende, og gemmer i projekt_grafik (samme sti
// som den manuelle modal). Endpoint: /api/graphics-agent (Claude). State pr. session.

let gaMessages      = [];    // API-samtale [{role, content}]
let gaBusy          = false;
let gaResult        = null;  // { config, html } fra seneste agent-svar
let gaError         = '';
let _gaAttachedHtml = '';    // vedhæftet HTML til næste besked
let _gaAttachedImage = null; // vedhæftet billede { media_type, data, dataUrl } til næste besked
let gaRevisionId      = null;  // projekt_grafik.id under revidering (null = ny grafik)
let gaRevisionGrafik  = null;  // rækken der reviders (+ ._html cachet)
let gaRevisionPending = false; // nuværende HTML endnu ikke lagt ind i samtalen

function renderGraphicsAgent() {
  const el = document.getElementById('graphicsAgentApp');
  if (!el) return;

  if (!el.querySelector('.ga-wrap')) {
    el.innerHTML = `
      <div class="ga-wrap">
        <div class="ga-head">
          <div class="ga-title">✨ GRAFIK-AGENT</div>
          <div class="ga-sub">Beskriv en grafik du vil have lavet, vedhæft en HTML-grafik du vil konfigurere, eller vælg en eksisterende grafik og bed om en ændring. Agenten gemmer den færdige grafik i projektet.</div>
        </div>
        <div class="ga-revise-row">
          <span class="ga-revise-lbl">Grafik:</span>
          <select id="ga-revise-sel"></select>
        </div>
        <div class="ga-messages" id="ga-messages"></div>
        <div id="ga-config"></div>
        <details class="ga-attach" id="ga-attach">
          <summary>📎 Vedhæft billede eller HTML (valgfrit)</summary>
          <div class="ga-attach-body">
            <label class="ga-attach-lbl">Billede af grafikken (JPG/PNG) — agenten genskaber den:</label>
            <input type="file" id="ga-img" accept="image/*">
            <div id="ga-img-preview" class="ga-img-preview"></div>
            <label class="ga-attach-lbl">…eller HTML-fil at konfigurere:</label>
            <input type="file" id="ga-file" accept=".html,.htm">
            <div class="ga-or">…eller indsæt HTML:</div>
            <textarea id="ga-paste" rows="4" placeholder="&lt;html&gt;…"></textarea>
          </div>
        </details>
        <div class="ga-send-row">
          <textarea id="ga-input" rows="2" placeholder="Skriv din besked…  (Ctrl+Enter sender)"></textarea>
          <button id="ga-send" class="ga-send-btn">Send</button>
        </div>
      </div>`;
    el.querySelector('#ga-send').addEventListener('click', _gaOnSend);
    el.querySelector('#ga-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); _gaOnSend(); }
    });
    el.querySelector('#ga-revise-sel').addEventListener('change', e => _gaSetRevision(e.target.value));
    el.querySelector('#ga-file').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      _gaAttachedHtml = await f.text();
      const p = el.querySelector('#ga-paste'); if (p) p.value = _gaAttachedHtml;
      toast('HTML vedhæftet', 'ok');
    });
    el.querySelector('#ga-paste').addEventListener('input', e => { _gaAttachedHtml = e.target.value; });
    el.querySelector('#ga-img').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(f);
        });
        const m = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(dataUrl);
        if (!m) { toast('Kunne ikke læse billedet', 'err'); return; }
        _gaAttachedImage = { media_type: m[1], data: m[2], dataUrl };
        const prev = el.querySelector('#ga-img-preview');
        if (prev) prev.innerHTML = `<img src="${dataUrl}" class="ga-img-thumb"><span class="ga-img-note">billede klar — skriv evt. en note og send</span>`;
        toast('Billede vedhæftet', 'ok');
      } catch { toast('Kunne ikke læse billedet', 'err'); }
    });
  }

  _gaRenderReviseOptions();
  _gaRenderMessages();
  _gaRenderConfig();
  const sendBtn = el.querySelector('#ga-send');
  if (sendBtn) { sendBtn.disabled = gaBusy; sendBtn.textContent = gaBusy ? 'Agenten tænker…' : 'Send'; }
}

// Dropdown: "＋ Ny grafik" + alle eksisterende custom-grafikker (til revidering)
function _gaRenderReviseOptions() {
  const sel = document.getElementById('ga-revise-sel');
  if (!sel) return;
  const opts = ['<option value="">＋ Ny grafik</option>'];
  (customGrafik || []).forEach(g => {
    opts.push(`<option value="${g.id}">✎ ${esc(g.label || g.trigger_key)}</option>`);
  });
  sel.innerHTML = opts.join('');
  sel.value = gaRevisionId || '';
  sel.disabled = gaBusy;
}

// Vælg grafik til revidering (henter dens nuværende HTML som kontekst) — eller "" = ny grafik.
async function _gaSetRevision(id) {
  if (!id) {
    gaRevisionId = null; gaRevisionGrafik = null; gaRevisionPending = false;
    gaMessages = []; gaResult = null; gaError = '';
    renderGraphicsAgent();
    return;
  }
  const g = (customGrafik || []).find(x => x.id === id);
  if (!g) return;
  gaBusy = true; renderGraphicsAgent();
  let html = '';
  try {
    const { data: blob, error } = await sbClient.storage.from('grafik').download(g.file_path);
    if (error) throw error;
    html = await blob.text();
  } catch (err) {
    gaBusy = false; gaRevisionId = null;
    toast('Kunne ikke hente grafikkens HTML: ' + (err.message || err), 'err');
    renderGraphicsAgent();
    return;
  }
  gaRevisionId = g.id;
  gaRevisionGrafik = { ...g, _html: html };
  gaRevisionPending = true;
  gaMessages = []; gaResult = null; gaError = ''; gaBusy = false;
  renderGraphicsAgent();
}

function _gaRevisionContext(g) {
  const ovLabel = { hoved: 'Master', komm: 'Secondary', 'overlay-3': 'Fullscreen' }[g.overlay_target] || 'Master';
  return `Dette er en REVIDERING af en eksisterende grafik. Behold trigger_key "${g.trigger_key}". `
    + `Nuværende opsætning: navn "${g.label || ''}", overlay ${ovLabel}, `
    + `${g.overlay_mode === 'standalone' ? 'standalone' : 'indlejret'}, `
    + `auto-skjul ${g.auto_hide_seconds ? g.auto_hide_seconds + 's' : 'nej'}, farve ${g.color || '#888888'}.\n`
    + `Nuværende HTML:\n\`\`\`html\n${g._html}\n\`\`\`\n\nØnsket ændring: `;
}

function _gaRenderMessages() {
  const box = document.getElementById('ga-messages');
  if (!box) return;
  if (!gaMessages.length) {
    const txt = gaRevisionId && gaRevisionGrafik
      ? `Reviderer <b>${esc(gaRevisionGrafik.label || gaRevisionGrafik.trigger_key)}</b> — skriv hvad der skal ændres (fx <em>"gør baggrunden mørkere"</em> eller <em>"skift teksten til …"</em>).`
      : `Fx: <em>"Lav en lower-third med navn og titel, blå accent"</em> — eller vedhæft en HTML-fil og skriv <em>"konfigurér denne"</em>.`;
    box.innerHTML = `<div class="ga-empty">${txt}</div>`;
    return;
  }
  let html = gaMessages.map(m => {
    const cls = m.role === 'user' ? 'ga-msg ga-user' : 'ga-msg ga-agent';
    const shown = m.role === 'user' ? _gaUserDisplay(m.content) : _gaStripBlocks(m.content);
    return `<div class="${cls}">${esc(shown).replace(/\n/g, '<br>')}</div>`;
  }).join('');
  if (gaBusy) html += `<div class="ga-msg ga-agent ga-typing">Agenten tænker…</div>`;
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

function _gaRenderConfig() {
  const box = document.getElementById('ga-config');
  if (!box) return;
  const c = gaResult && gaResult.config;
  if (!c) { box.innerHTML = gaError ? `<div class="ga-error">⚠️ ${esc(gaError)}</div>` : ''; return; }
  const ovLabel = { hoved: 'Master', komm: 'Secondary', 'overlay-3': 'Fullscreen' }[c.overlay_target] || c.overlay_target || '—';
  const hasHtml = !!(gaResult.html || _gaLastUploadedHtml() || (gaRevisionGrafik && gaRevisionGrafik._html));
  const isRev = !!gaRevisionId;
  box.innerHTML = `
    <div class="ga-config-card">
      <div class="ga-config-title">${isRev ? 'Klar til at opdatere' : 'Klar til at gemme'}</div>
      <div class="ga-config-grid">
        <span>Navn</span><b>${esc(c.label || '—')}</b>
        <span>Trigger</span><b>${esc(isRev ? gaRevisionGrafik.trigger_key : (c.trigger_key || '—'))}</b>
        <span>Overlay</span><b>${esc(ovLabel)} · ${c.overlay_mode === 'standalone' ? 'Standalone' : 'Indlejret'}</b>
        <span>Auto-skjul</span><b>${c.auto_hide_seconds ? esc(c.auto_hide_seconds) + ' sek' : 'nej'}</b>
        <span>HTML</span><b>${gaResult.html ? 'genereret af agenten' : (isRev ? 'uændret (kun config)' : (hasHtml ? 'fra vedhæftet fil' : '⚠️ mangler'))}</b>
      </div>
      <button id="ga-save" class="ga-save-btn"${hasHtml ? '' : ' disabled'}>${isRev ? 'Opdater grafik' : 'Gem grafik'}</button>
    </div>`;
  const btn = box.querySelector('#ga-save');
  if (btn && hasHtml) btn.addEventListener('click', _gaSaveGraphic);
}

// Strip kodeblokke fra agent-tekst der vises i chatten (config/html surfaces i kort nedenfor)
function _gaStripBlocks(text) {
  return String(text || '')
    .replace(/```json[\s\S]*?```/gi, '')
    .replace(/```html[\s\S]*?```/gi, '〔grafik-HTML genereret ↓〕')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function _gaUserDisplay(content) {
  if (Array.isArray(content)) {
    const t = content.find(p => p.type === 'text');
    const hasImg = content.some(p => p.type === 'image');
    return (t ? t.text : '') + (hasImg ? '\n〔billede vedhæftet〕' : '');
  }
  return String(content || '').replace(/```html[\s\S]*?```/gi, '〔HTML vedhæftet〕').trim();
}

// Ryd alle vedhæftninger (HTML + billede) + deres UI
function _gaClearAttachments() {
  _gaAttachedHtml = ''; _gaAttachedImage = null;
  const p = document.getElementById('ga-paste'); if (p) p.value = '';
  const f = document.getElementById('ga-file');  if (f) f.value = '';
  const img = document.getElementById('ga-img'); if (img) img.value = '';
  const prev = document.getElementById('ga-img-preview'); if (prev) prev.innerHTML = '';
  const a = document.getElementById('ga-attach'); if (a) a.open = false;
}

function _gaParseResult(text) {
  let config = null, html = null;
  const jsonM = String(text).match(/```json\s*([\s\S]*?)```/i);
  if (jsonM) { try { config = JSON.parse(jsonM[1].trim()); } catch { config = null; } }
  const htmlM = String(text).match(/```html\s*([\s\S]*?)```/i);
  if (htmlM) html = htmlM[1].trim();
  return { config, html };
}

function _gaLastUploadedHtml() {
  for (let i = gaMessages.length - 1; i >= 0; i--) {
    const c = gaMessages[i];
    if (c.role === 'user' && typeof c.content === 'string') {
      const m = c.content.match(/```html\s*([\s\S]*?)```/i);
      if (m) return m[1].trim();
    }
  }
  return null;
}

async function _gaOnSend() {
  if (gaBusy) return;
  const inp = document.getElementById('ga-input');
  const text = (inp?.value || '').trim();
  const attached = _gaAttachedHtml.trim();
  const img = _gaAttachedImage;
  if (!text && !attached && !img && !gaRevisionPending) { toast('Skriv en besked', 'err'); return; }

  let content;
  if (img) {
    // Billede vedhæftet → send som vision-besked (tekst + image-blok)
    content = [
      { type: 'text', text: text || 'Genskab denne grafik som selvstændig HTML til systemet (transparent, runAnimationIN/OUT).' },
      { type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } }
    ];
    _gaClearAttachments();
  } else if (gaRevisionPending && gaRevisionGrafik) {
    // Første besked i en revidering: læg nuværende HTML + config ind som kontekst
    content = _gaRevisionContext(gaRevisionGrafik) + (text || '(beskriv ændringen)');
    gaRevisionPending = false;
  } else {
    content = text;
    if (attached) {
      content = (text ? text + '\n\n' : 'Konfigurér denne grafik:\n\n') + '```html\n' + attached + '\n```';
      _gaClearAttachments();
    }
  }
  gaMessages.push({ role: 'user', content });
  if (inp) inp.value = '';
  gaResult = null; gaError = ''; gaBusy = true;
  renderGraphicsAgent();

  await _gaCallAgent();

  gaBusy = false;
  if (gaError && inp) inp.value = text; // gendan input så brugeren kan prøve igen
  renderGraphicsAgent();
}

async function _gaCallAgent() {
  try {
    const r = await apiFetch('/api/graphics-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: gaMessages, projekt_id: aktivProjektId })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      gaError = (data.error || ('Fejl ' + r.status)) + (r.status === 503 ? ' — tilføj ANTHROPIC_API_KEY i Vercel.' : '');
      gaMessages.pop(); // fjern ubesvaret brugerbesked så samtalen forbliver gyldig
      return;
    }
    const text = data.text || '(tomt svar)';
    gaMessages.push({ role: 'assistant', content: text });
    gaResult = _gaParseResult(text);
  } catch (err) {
    gaError = 'Netværksfejl: ' + err.message;
    gaMessages.pop();
  }
}

async function _gaSaveGraphic() {
  const c = gaResult && gaResult.config;
  if (!c) return;
  const btn = document.getElementById('ga-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Gemmer…'; }
  try {
    // ── REVIDERING: overskriv samme fil + UPDATE rækken (behold trigger_key + file_path) ──
    if (gaRevisionId && gaRevisionGrafik) {
      const g = gaRevisionGrafik;
      const html = gaResult.html || g._html;               // ny HTML fra agenten, ellers uændret
      const mode = c.overlay_mode === 'standalone' ? 'standalone' : 'embed';
      const target = mode === 'standalone' ? 'hoved'
        : (['hoved', 'komm', 'overlay-3'].includes(c.overlay_target) ? c.overlay_target : (g.overlay_target || 'hoved'));
      const autoHide = (c.auto_hide_seconds > 0) ? Number(c.auto_hide_seconds) : null;

      let content = html;
      if (mode === 'standalone' && typeof injectStandaloneTrigger === 'function') {
        content = injectStandaloneTrigger(html, g.trigger_key, aktivProjektId, autoHide || 0);
      }
      const blob = new Blob([content], { type: 'text/html' });
      const { error: upErr } = await sbClient.storage.from('grafik').upload(g.file_path, blob, { contentType: 'text/html', upsert: true });
      if (upErr) { toast('Upload fejlede: ' + upErr.message, 'err'); return; }

      const { error: dbErr } = await sbClient.from('projekt_grafik').update({
        label: c.label || g.label, color: c.color || g.color || '#888888',
        overlay_mode: mode, overlay_target: target, auto_hide_seconds: autoHide
      }).eq('id', gaRevisionId);
      if (dbErr) { toast('DB fejl: ' + dbErr.message, 'err'); return; }

      if (typeof loadKunstomGrafik === 'function') await loadKunstomGrafik();
      if (typeof renderGrafikOps === 'function') renderGrafikOps();
      if (typeof renderGrafik === 'function') renderGrafik();
      toast('Grafik opdateret ✓', 'ok');
      gaRevisionGrafik._html = html; // videre revideringer bygger på den nye
      gaResult = null;
      const cfgBox = document.getElementById('ga-config');
      if (cfgBox) cfgBox.innerHTML = `<div class="ga-saved">✅ "${esc(c.label || g.trigger_key)}" opdateret — genindlæs overlayet i vMix for at se ændringen.</div>`;
      return;
    }

    // ── NY GRAFIK: upload + insert ──
    const html = gaResult.html || _gaLastUploadedHtml();
    if (!html) { toast('Ingen HTML at gemme — bed agenten generere grafikken', 'err'); return; }
    const trigKey = (c.trigger_key || ('grafik_' + Date.now())).trim();
    const mode = c.overlay_mode === 'standalone' ? 'standalone' : 'embed';
    const target = mode === 'standalone'
      ? 'hoved'
      : (['hoved', 'komm', 'overlay-3'].includes(c.overlay_target) ? c.overlay_target : 'hoved');
    const autoHide = (c.auto_hide_seconds > 0) ? Number(c.auto_hide_seconds) : null;

    let content = html;
    if (mode === 'standalone' && typeof injectStandaloneTrigger === 'function') {
      content = injectStandaloneTrigger(html, trigKey, aktivProjektId, autoHide || 0);
    }
    const filePath = aktivProjektId + '/' + trigKey + '.html';
    const blob = new Blob([content], { type: 'text/html' });
    const { error: upErr } = await sbClient.storage.from('grafik').upload(filePath, blob, { contentType: 'text/html', upsert: true });
    if (upErr) { toast('Upload fejlede: ' + upErr.message, 'err'); return; }
    const { data: urlData } = sbClient.storage.from('grafik').getPublicUrl(filePath);

    const { error: dbErr } = await sbClient.from('projekt_grafik').insert({
      projekt_id: aktivProjektId, label: c.label || trigKey, trigger_key: trigKey,
      file_url: urlData.publicUrl, file_path: filePath, color: c.color || '#888888',
      overlay_mode: mode, overlay_input: null, overlay_target: target,
      auto_hide_seconds: autoHide, template_type: 'agent'
    });
    if (dbErr) { toast('DB fejl: ' + dbErr.message, 'err'); return; }

    if (typeof loadKunstomGrafik === 'function') await loadKunstomGrafik();
    if (typeof renderGrafikOps === 'function') renderGrafikOps();
    if (typeof renderGrafik === 'function') renderGrafik();
    toast('Grafik gemt ✓', 'ok');
    gaResult = null;
    const cfgBox = document.getElementById('ga-config');
    if (cfgBox) cfgBox.innerHTML = `<div class="ga-saved">✅ "${esc(c.label || trigKey)}" er gemt — se den i GRAFIK OPS → EGNE GRAFIKKER og i komponisten.</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = gaRevisionId ? 'Opdater grafik' : 'Gem grafik'; }
  }
}
