// ── GRAFIK-AGENT ───────────────────────────────────────────────
// AI-assistent der interviewer operatøren og enten KONFIGURERER en uploadet HTML-grafik
// eller GENERERER en ny, og gemmer den i projekt_grafik (samme sti som den manuelle modal).
// Endpoint: /api/graphics-agent (Claude). State holdes pr. session.

let gaMessages      = [];    // API-samtale [{role, content}]
let gaBusy          = false;
let gaResult        = null;  // { config, html } fra seneste agent-svar
let gaError         = '';
let _gaAttachedHtml = '';    // vedhæftet HTML til næste besked

function renderGraphicsAgent() {
  const el = document.getElementById('graphicsAgentApp');
  if (!el) return;

  if (!el.querySelector('.ga-wrap')) {
    el.innerHTML = `
      <div class="ga-wrap">
        <div class="ga-head">
          <div class="ga-title">✨ GRAFIK-AGENT</div>
          <div class="ga-sub">Beskriv en grafik du vil have lavet — eller vedhæft en HTML-grafik du vil konfigurere. Agenten stiller nogle få spørgsmål og gemmer den færdige grafik i projektet.</div>
        </div>
        <div class="ga-messages" id="ga-messages"></div>
        <div id="ga-config"></div>
        <details class="ga-attach" id="ga-attach">
          <summary>📎 Vedhæft HTML (valgfrit)</summary>
          <div class="ga-attach-body">
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
    el.querySelector('#ga-file').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      _gaAttachedHtml = await f.text();
      const p = el.querySelector('#ga-paste'); if (p) p.value = _gaAttachedHtml;
      toast('HTML vedhæftet', 'ok');
    });
    el.querySelector('#ga-paste').addEventListener('input', e => { _gaAttachedHtml = e.target.value; });
  }

  _gaRenderMessages();
  _gaRenderConfig();
  const sendBtn = el.querySelector('#ga-send');
  if (sendBtn) { sendBtn.disabled = gaBusy; sendBtn.textContent = gaBusy ? 'Agenten tænker…' : 'Send'; }
}

function _gaRenderMessages() {
  const box = document.getElementById('ga-messages');
  if (!box) return;
  if (!gaMessages.length) {
    box.innerHTML = `<div class="ga-empty">Fx: <em>"Lav en lower-third med navn og titel, blå accent"</em> — eller vedhæft en HTML-fil og skriv <em>"konfigurér denne"</em>.</div>`;
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
  const hasHtml = !!(gaResult.html || _gaLastUploadedHtml());
  box.innerHTML = `
    <div class="ga-config-card">
      <div class="ga-config-title">Klar til at gemme</div>
      <div class="ga-config-grid">
        <span>Navn</span><b>${esc(c.label || '—')}</b>
        <span>Trigger</span><b>${esc(c.trigger_key || '—')}</b>
        <span>Overlay</span><b>${esc(ovLabel)} · ${c.overlay_mode === 'standalone' ? 'Standalone' : 'Indlejret'}</b>
        <span>Auto-skjul</span><b>${c.auto_hide_seconds ? esc(c.auto_hide_seconds) + ' sek' : 'nej'}</b>
        <span>HTML</span><b>${gaResult.html ? 'genereret af agenten' : (hasHtml ? 'fra vedhæftet fil' : '⚠️ mangler')}</b>
      </div>
      <button id="ga-save" class="ga-save-btn"${hasHtml ? '' : ' disabled'}>Gem grafik</button>
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
  return String(content || '').replace(/```html[\s\S]*?```/gi, '〔HTML vedhæftet〕').trim();
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
    if (gaMessages[i].role === 'user') {
      const m = gaMessages[i].content.match(/```html\s*([\s\S]*?)```/i);
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
  if (!text && !attached) { toast('Skriv en besked', 'err'); return; }

  let content = text;
  if (attached) {
    content = (text ? text + '\n\n' : 'Konfigurér denne grafik:\n\n') + '```html\n' + attached + '\n```';
    _gaAttachedHtml = '';
    const p = document.getElementById('ga-paste'); if (p) p.value = '';
    const f = document.getElementById('ga-file');  if (f) f.value = '';
    const a = document.getElementById('ga-attach'); if (a) a.open = false;
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
  const html = gaResult.html || _gaLastUploadedHtml();
  if (!html) { toast('Ingen HTML at gemme — bed agenten generere grafikken', 'err'); return; }

  const btn = document.getElementById('ga-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Gemmer…'; }
  try {
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
    if (btn) { btn.disabled = false; btn.textContent = 'Gem grafik'; }
  }
}
