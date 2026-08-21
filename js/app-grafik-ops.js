// ── GRAFIK OPS — injektion og modal state ─────────────────────
let _egneGrafikStep = 1;
let _egneGrafikData = {};
let _egneGrafikEditId = null;

function injectStandaloneTrigger(html, trigKey, pid, autoHideSec) {
  if (html.includes("var _trigKey='") && html.includes('runAnimationIN')) return html;
  const ahs = Math.max(0, parseInt(autoHideSec) || 0);
  const script = `<script>document.addEventListener('DOMContentLoaded',function(){
var _pid=${JSON.stringify(pid)},_key=${JSON.stringify(trigKey)},_ahs=${ahs},_aht=null;
if(typeof window.runAnimationIN!=='function'){
  window.runAnimationIN=function(){if(document.body)document.body.classList.add('active');if(_ahs>0){clearTimeout(_aht);_aht=setTimeout(function(){window.runAnimationOUT();},_ahs*1000);}};
  window.runAnimationOUT=function(){if(document.body)document.body.classList.remove('active');clearTimeout(_aht);_aht=null;};
}else if(_ahs>0){
  var _orig=window.runAnimationIN;
  window.runAnimationIN=function(){clearTimeout(_aht);_aht=null;_orig.apply(this,arguments);_aht=setTimeout(function(){_aht=null;if(typeof window.runAnimationOUT==='function')window.runAnimationOUT();},_ahs*1000);};
}
var _ws,_ref=0,_hb;
function _connect(){try{
  _ws=new WebSocket('wss://rxzxdcweqpbnvfkpnnrn.supabase.co/realtime/v1/websocket?apikey=${SB_ANON}&vsn=1.0.0');
  _ws.onopen=function(){_ws.send(JSON.stringify({topic:'realtime:triggers-'+_pid,event:'phx_join',payload:{config:{broadcast:{self:false,ack:false},presence:{key:''},postgres_changes:[{event:'UPDATE',schema:'public',table:'settings',filter:'projekt_id=eq.'+_pid}]},access_token:'${SB_ANON}'},ref:String(++_ref)}));_hb=setInterval(function(){if(_ws&&_ws.readyState===1)_ws.send(JSON.stringify({topic:'phoenix',event:'heartbeat',payload:{},ref:String(++_ref)}));},25000);};
  _ws.onmessage=function(e){try{var msg=JSON.parse(e.data);if(!msg||msg.event!=='postgres_changes')return;var rec=msg.payload&&msg.payload.data&&msg.payload.data.record;if(!rec||rec.key!==_key)return;if(rec.value==='in')window.runAnimationIN();if(rec.value==='out'&&typeof window.runAnimationOUT==='function')window.runAnimationOUT();}catch(x){}};
  _ws.onclose=function(){clearInterval(_hb);_hb=null;setTimeout(_connect,3000);};
  _ws.onerror=function(){try{_ws.close();}catch(x){}};
}catch(x){setTimeout(_connect,3000);}}
_connect();
});<\/script>`;
  return html.includes('</body>') ? html.replace('</body>', script + '</body>') : html + script;
}

function _egneGrafikAutoSuggestTrigKey(type) {
  const existing = (customGrafik || []).filter(g => g.template_type === type || g.trigger_key.startsWith(type + '_'));
  return type + '_' + (existing.length + 1);
}

function openEgneGrafikModal(editId) {
  _egneGrafikEditId = editId || null;
  _egneGrafikData = {};
  if (editId) {
    const g = (customGrafik || []).find(x => x.id === editId);
    if (g) _egneGrafikData = { label: g.label, trigKey: g.trigger_key, color: g.color || '#888888', overlay_mode: g.overlay_mode || 'embed', overlay_input: g.overlay_input || '', overlay_target: g.overlay_target || 'hoved', auto_hide_seconds: g.auto_hide_seconds || '' };
  }
  _egneGrafikGoStep(1);
  document.getElementById('egne-grafik-modal').style.display = 'flex';
}

function closeEgneGrafikModal() {
  document.getElementById('egne-grafik-modal').style.display = 'none';
}

function _egneGrafikGoStep(step) {
  _egneGrafikStep = step;
  document.getElementById('egn-step1').style.display = step === 1 ? 'flex' : 'none';
  document.getElementById('egn-step2').style.display = step === 2 ? 'flex' : 'none';
  document.getElementById('egn-step3').style.display = step === 3 ? 'flex' : 'none';
  if (step === 1) _egneGrafikRenderStep1();
  if (step === 2) _egneGrafikRenderStep2();
}

function _egneGrafikRenderStep1() {
  const d = _egneGrafikData;
  const isEdit = !!_egneGrafikEditId;
  document.getElementById('egn-step1-title').textContent = isEdit ? 'REDIGÉR GRAFIK (1/3)' : 'TILFØJ GRAFIK (1/3)';
  document.getElementById('egn-label-inp').value = d.label || '';
  document.getElementById('egn-color-inp').value = d.color || '#888888';
  document.getElementById('egn-auto-hide-check').checked = !!(d.auto_hide_seconds > 0);
  document.getElementById('egn-auto-hide-secs').value = d.auto_hide_seconds || '';
  document.getElementById('egn-auto-hide-secs').style.display = (d.auto_hide_seconds > 0) ? 'inline-block' : 'none';
  document.getElementById('egn-auto-hide-check').onchange = function() {
    document.getElementById('egn-auto-hide-secs').style.display = this.checked ? 'inline-block' : 'none';
  };
  // Trigger key
  const sel = document.getElementById('egn-trig-sel');
  const customInp = document.getElementById('egn-trig-custom');
  const key = d.trigKey || '';
  const knownKeys = Array.from(sel.options).map(o => o.value).filter(v => v !== 'custom');
  if (key && knownKeys.includes(key)) {
    sel.value = key;
    customInp.style.display = 'none';
  } else if (key) {
    sel.value = 'custom';
    customInp.style.display = 'inline-block';
    customInp.value = key;
  } else {
    sel.value = knownKeys[0];
    customInp.style.display = 'none';
  }
  sel.onchange = function() {
    customInp.style.display = this.value === 'custom' ? 'inline-block' : 'none';
  };
  // Fil-upload listener
  document.getElementById('egn-file-inp').onchange = function() {
    const file = this.files[0];
    if (!file) return;
    if (!document.getElementById('egn-label-inp').value)
      document.getElementById('egn-label-inp').value = file.name.replace(/\.html?$/i, '').replace(/[_-]/g, ' ');
    const reader = new FileReader();
    reader.onload = function(e) {
      const m = e.target.result.match(/var _trigKey='([^']+)'/);
      if (!m) return;
      const k = m[1];
      const opt = Array.from(sel.options).find(o => o.value === k);
      if (opt) { sel.value = k; customInp.style.display = 'none'; }
      else { sel.value = 'custom'; customInp.style.display = 'inline-block'; customInp.value = k; }
    };
    reader.readAsText(file);
  };
  // Skabelon-type selector
  document.getElementById('egn-src-upload').onchange = () => {
    document.getElementById('egn-upload-section').style.display = 'flex';
    document.getElementById('egn-template-section').style.display = 'none';
  };
  document.getElementById('egn-src-template').onchange = () => {
    document.getElementById('egn-upload-section').style.display = 'none';
    document.getElementById('egn-template-section').style.display = 'flex';
    _egneGrafikSuggestTemplateKey();
  };
  document.getElementById('egn-tpl-type').onchange = _egneGrafikSuggestTemplateKey;
  // Render template-felter for default type
  _egneGrafikRenderTemplateFields(document.getElementById('egn-tpl-type').value);
}

function _egneGrafikSuggestTemplateKey() {
  const type = document.getElementById('egn-tpl-type').value;
  const sel = document.getElementById('egn-trig-sel');
  const customInp = document.getElementById('egn-trig-custom');
  sel.value = 'custom';
  customInp.style.display = 'inline-block';
  customInp.value = _egneGrafikAutoSuggestTrigKey(type);
  _egneGrafikRenderTemplateFields(type);
}

function _egneGrafikRenderTemplateFields(type) {
  const el = document.getElementById('egn-tpl-fields');
  if (!el) return;
  const inp = (id, ph, val='') => `<input id="${id}" type="text" placeholder="${ph}" value="${val.replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;background:#111;border:1px solid #333;color:#ccc;padding:6px;border-radius:6px;font-size:11px;">`;
  const colorInp = (id, val='#4a9eff') => `<div style="display:flex;align-items:center;gap:8px;"><label style="font-size:11px;color:#9c9c9c;letter-spacing:1px;">FARVE</label><input id="${id}" type="color" value="${val}" style="height:28px;width:50px;background:#111;border:1px solid #333;border-radius:4px;cursor:pointer;padding:2px;"></div>`;
  if (type === 'lower_third') {
    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">${inp('egn-tpl-navn','Navn…')}${inp('egn-tpl-titel','Titel…')}${colorInp('egn-tpl-farve')}</div>`;
  } else if (type === 'bug') {
    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">${inp('egn-tpl-tekst','Tekst…')}
      <select id="egn-tpl-pos" style="background:#111;border:1px solid #333;color:#ccc;padding:6px;border-radius:6px;font-size:11px;">
        <option value="tl">Øverst venstre</option><option value="tr">Øverst højre</option>
        <option value="bl">Nederst venstre</option><option value="br">Nederst højre</option>
      </select></div>`;
  } else if (type === 'fullscreen') {
    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">${inp('egn-tpl-overskrift','Overskrift…')}${inp('egn-tpl-undertekst','Undertekst…')}
      <div style="display:flex;align-items:center;gap:8px;"><label style="font-size:11px;color:#9c9c9c;letter-spacing:1px;">BAGGRUND</label><input id="egn-tpl-bg" type="color" value="#000000" style="height:28px;width:50px;background:#111;border:1px solid #333;border-radius:4px;cursor:pointer;padding:2px;"></div></div>`;
  } else if (type === 'timer') {
    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">
      <div style="display:flex;gap:8px;align-items:center;"><label style="font-size:11px;color:#9c9c9c;letter-spacing:1px;min-width:50px;">START (sek)</label><input id="egn-tpl-fra" type="number" min="0" value="0" style="width:80px;background:#111;border:1px solid #333;color:#ccc;padding:6px;border-radius:6px;font-size:11px;"></div>
      <select id="egn-tpl-format" style="background:#111;border:1px solid #333;color:#ccc;padding:6px;border-radius:6px;font-size:11px;">
        <option value="mm:ss">mm:ss</option><option value="ss">sekunder</option>
      </select></div>`;
  } else {
    el.innerHTML = '';
  }
}

function _egneGrafikRenderStep2() {
  const d = _egneGrafikData;
  document.getElementById('egn-mode-standalone').checked = d.overlay_mode === 'standalone';
  document.getElementById('egn-mode-embed').checked = d.overlay_mode !== 'standalone';
  document.getElementById('egn-input-nr').value = d.overlay_input || '';
  const targetSel = document.getElementById('egn-target-sel');
  if (targetSel) targetSel.value = d.overlay_target || 'hoved';
  const toggleMode = () => {
    const sa = document.getElementById('egn-mode-standalone').checked;
    document.getElementById('egn-input-row').style.display = sa ? 'block' : 'none';
    document.getElementById('egn-target-row').style.display = sa ? 'none' : 'block';
  };
  document.getElementById('egn-mode-standalone').onchange = toggleMode;
  document.getElementById('egn-mode-embed').onchange = toggleMode;
  toggleMode();
}

async function _egneGrafikNextStep() {
  if (_egneGrafikStep === 1) {
    // Saml data fra trin 1
    const label = document.getElementById('egn-label-inp').value.trim();
    if (!label) { toast('Udfyld label', 'err'); return; }
    const tSel = document.getElementById('egn-trig-sel').value;
    const trigKey = tSel === 'custom'
      ? document.getElementById('egn-trig-custom').value.trim()
      : tSel;
    if (!trigKey) { toast('Udfyld trigger-nøgle', 'err'); return; }
    // Tjek for kollision (undtagen ved redigering af samme id)
    const collision = (customGrafik || []).find(g => g.trigger_key === trigKey && g.id !== _egneGrafikEditId);
    if (collision) { toast('Trigger-nøgle allerede i brug: ' + trigKey, 'err'); return; }
    const autoHideCheck = document.getElementById('egn-auto-hide-check').checked;
    const autoHideSecs = autoHideCheck ? (parseInt(document.getElementById('egn-auto-hide-secs').value) || 0) : 0;
    const useTemplate = document.getElementById('egn-src-template').checked;
    _egneGrafikData = {
      ..._egneGrafikData,
      label,
      trigKey,
      color: document.getElementById('egn-color-inp').value,
      auto_hide_seconds: autoHideSecs > 0 ? autoHideSecs : null,
      useTemplate,
      templateType: useTemplate ? document.getElementById('egn-tpl-type').value : null,
      templateFields: useTemplate ? _egneGrafikGetTemplateFields() : null,
      file: useTemplate ? null : (document.getElementById('egn-file-inp').files[0] || null),
    };
    if (!_egneGrafikEditId && !_egneGrafikData.file && !useTemplate) { toast('Vælg en HTML-fil', 'err'); return; }
    _egneGrafikGoStep(2);
  } else if (_egneGrafikStep === 2) {
    _egneGrafikData.overlay_mode = document.getElementById('egn-mode-standalone').checked ? 'standalone' : 'embed';
    _egneGrafikData.overlay_input = parseInt(document.getElementById('egn-input-nr').value) || null;
    _egneGrafikData.overlay_target = _egneGrafikData.overlay_mode === 'standalone' ? 'hoved' : (document.getElementById('egn-target-sel')?.value || 'hoved');
    await _egneGrafikSave();
  }
}

function _egneGrafikGetTemplateFields() {
  const type = document.getElementById('egn-tpl-type').value;
  if (type === 'lower_third') return { navn: document.getElementById('egn-tpl-navn')?.value || '', titel: document.getElementById('egn-tpl-titel')?.value || '', farve: document.getElementById('egn-tpl-farve')?.value || '#4a9eff' };
  if (type === 'bug') return { tekst: document.getElementById('egn-tpl-tekst')?.value || '', position: document.getElementById('egn-tpl-pos')?.value || 'tl' };
  if (type === 'fullscreen') return { overskrift: document.getElementById('egn-tpl-overskrift')?.value || '', undertekst: document.getElementById('egn-tpl-undertekst')?.value || '', baggrund: document.getElementById('egn-tpl-bg')?.value || '#000000' };
  if (type === 'timer') return { fra: parseInt(document.getElementById('egn-tpl-fra')?.value) || 0, format: document.getElementById('egn-tpl-format')?.value || 'mm:ss' };
  return {};
}

async function _egneGrafikSave() {
  const d = _egneGrafikData;
  const saveBtn = document.getElementById('egn-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Gemmer…'; }

  try {
    let fileUrl, filePath;

    if (!_egneGrafikEditId) {
      // Byg eller læs HTML-indhold
      let htmlContent;
      if (d.useTemplate) {
        htmlContent = _buildTemplateHtml(d.templateType, d.trigKey, d.templateFields, d.auto_hide_seconds);
      } else {
        htmlContent = await d.file.text();
        if (d.overlay_mode === 'standalone') {
          htmlContent = injectStandaloneTrigger(htmlContent, d.trigKey, aktivProjektId, d.auto_hide_seconds);
        }
      }
      const fileName = d.useTemplate ? (d.trigKey + '.html') : d.file.name;
      filePath = aktivProjektId + '/' + fileName;
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const { error: upErr } = await sbClient.storage.from('grafik').upload(filePath, blob, { contentType: 'text/html', upsert: true });
      if (upErr) { toast('Upload fejlede: ' + upErr.message, 'err'); return; }
      const { data: urlData } = sbClient.storage.from('grafik').getPublicUrl(filePath);
      fileUrl = urlData.publicUrl;

      const { error: dbErr } = await sbClient.from('projekt_grafik').insert({
        projekt_id: aktivProjektId, label: d.label, trigger_key: d.trigKey,
        file_url: fileUrl, file_path: filePath, color: d.color,
        overlay_mode: d.overlay_mode, overlay_input: d.overlay_input,
        overlay_target: d.overlay_target || 'hoved',
        auto_hide_seconds: d.auto_hide_seconds, template_type: d.templateType
      });
      if (dbErr) { toast('DB fejl: ' + dbErr.message, 'err'); return; }

      await loadKunstomGrafik();
      if (typeof renderGrafikOps === 'function') renderGrafikOps();
      renderGrafik();

      // Vis bekræftelsesskærm (trin 3)
      const newRow = (customGrafik || []).find(g => g.trigger_key === d.trigKey);
      _egneGrafikShowConfirm(newRow || { trigger_key: d.trigKey, file_url: fileUrl, overlay_mode: d.overlay_mode });
    } else {
      // Redigering — opdater kun metadata
      const { error: dbErr } = await sbClient.from('projekt_grafik').update({
        label: d.label, color: d.color, trigger_key: d.trigKey,
        overlay_mode: d.overlay_mode, overlay_input: d.overlay_input,
        overlay_target: d.overlay_target || 'hoved',
        auto_hide_seconds: d.auto_hide_seconds
      }).eq('id', _egneGrafikEditId);
      if (dbErr) { toast('DB fejl: ' + dbErr.message, 'err'); return; }
      await loadKunstomGrafik();
      if (typeof renderGrafikOps === 'function') renderGrafikOps();
      renderGrafik();
      toast('Grafik opdateret', 'ok');
      closeEgneGrafikModal();
    }
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Gem grafik'; }
  }
}

function _egneGrafikShowConfirm(g) {
  _egneGrafikGoStep(3);
  const isStandalone = g.overlay_mode === 'standalone';
  const origin = location.origin;
  const pid = aktivProjektId;
  const fileUrlWithPid = isStandalone ? (g.file_url + '?p=' + pid) : null;
  const onUrl  = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=${encodeURIComponent(g.trigger_key)}&value=in`;
  const offUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=${encodeURIComponent(g.trigger_key)}&value=out`;

  let html = `<div style="font-size:13px;color:#86efac;margin-bottom:12px;">&#10003; Grafik tilføjet!</div>`;
  if (isStandalone) {
    html += `<div style="margin-bottom:10px;"><div style="font-size:11px;color:#9c9c9c;letter-spacing:1px;margin-bottom:4px;">INDSÆT I VMIX (Browser Input):</div>
      <div style="display:flex;align-items:center;gap:6px;"><span style="flex:1;font-size:11px;color:#aaa;background:#111;border:1px solid #333;padding:5px 8px;border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${fileUrlWithPid}</span>
      <button onclick="navigator.clipboard.writeText(${JSON.stringify(fileUrlWithPid)});toast('Kopieret','ok')" style="padding:4px 8px;background:#222;border:1px solid #333;color:#aaa;border-radius:4px;cursor:pointer;font-size:11px;">⎘</button></div></div>`;
  } else {
    const tLabel = g.overlay_target === 'komm' ? 'Kommentator (overlay-komm.html)' : 'Hoved Overlay (overlay.html)';
    html += `<div style="font-size:11px;color:#9c9c9c;margin-bottom:10px;padding:8px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;">Indlejret i ${tLabel} — genindlæs overlayet i vMix for at aktivere grafikken.</div>`;
  }
  html += `<div><div style="font-size:11px;color:#9c9c9c;letter-spacing:1px;margin-bottom:6px;">COMPANION LINKS:</div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <div style="display:flex;align-items:center;gap:6px;"><span style="width:24px;font-size:11px;color:#86efac;">PÅ</span><span style="flex:1;font-size:11px;color:#aaa;background:#111;border:1px solid #333;padding:5px 8px;border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${onUrl}</span><button onclick="navigator.clipboard.writeText(${JSON.stringify(onUrl)});toast('Kopieret','ok')" style="padding:4px 8px;background:#222;border:1px solid #333;color:#aaa;border-radius:4px;cursor:pointer;font-size:11px;">⎘</button></div>
      <div style="display:flex;align-items:center;gap:6px;"><span style="width:24px;font-size:11px;color:#ef4444;">AF</span><span style="flex:1;font-size:11px;color:#aaa;background:#111;border:1px solid #333;padding:5px 8px;border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${offUrl}</span><button onclick="navigator.clipboard.writeText(${JSON.stringify(offUrl)});toast('Kopieret','ok')" style="padding:4px 8px;background:#222;border:1px solid #333;color:#aaa;border-radius:4px;cursor:pointer;font-size:11px;">⎘</button></div>
    </div></div>`;
  document.getElementById('egn-confirm-body').innerHTML = html;
}

async function deleteEgneGrafikById(id, path, label) {
  if (!confirm('Slet "' + (label || 'grafik') + '"?')) return;
  try { await sbClient.storage.from('grafik').remove([path]); } catch {}
  try { await sbDelete('projekt_grafik?id=eq.' + id); } catch { toast('Fejl ved slet', 'err'); return; }
  await loadKunstomGrafik();
  if (typeof renderGrafikOps === 'function') renderGrafikOps();
  renderGrafik();
  toast('Grafik slettet');
}

async function deleteEgneGrafik(btn) {
  const id    = btn.dataset.customId;
  const path  = btn.dataset.customPath;
  const label = btn.closest('.grafik-block')?.querySelector('.grafik-block-name')?.textContent || 'grafik';
  await deleteEgneGrafikById(id, path, label);
}

// ── OVERLAY-KOMPONIST ──────────────────────────────────────────
// De tre vMix-overlay-vinduer (interne id'er = grafik_overlay_map-keys).
const COMPOSER_OVERLAYS = [
  { key: 'hoved',     label: 'Master',     hint: 'overlay.html' },
  { key: 'komm',      label: 'Secondary',  hint: 'overlay-komm.html' },
  { key: 'overlay-3', label: 'Fullscreen', hint: 'overlay-3.html' },
];

// Engangs-flad-gøring: flet gammel overlay_lag_order (hoved) + ticker_lag_order (nested
// under-orden) til ÉN flad logisk liste. Ticker-frames (ticker-breaking/score-breaking)
// collapses til det logiske 'breaking'-punkt (overlay.html ekspanderer det til frames).
// Kaldes fra refreshGrafiktState når begge lister er friskt loadet fra DB. Idempotent.
function _migrateLagOrderToFlat() {
  // Allerede flad? (flad model har ticker-under-ids i selve hovedlisten)
  if (overlayLagOrder.some(id => id === 'live-boks' || id === 'breaking' || id === 'score')) return;
  const main = [...overlayLagOrder];
  const sub  = [...tickerLagOrder];
  const tIdx = main.indexOf('ticker');
  let flat = tIdx >= 0 ? [...main.slice(0, tIdx), ...sub, ...main.slice(tIdx + 1)] : [...main, ...sub];
  const hadBreakingFrame = flat.includes('ticker-breaking') || flat.includes('score-breaking');
  flat = flat.filter(id => id !== 'ticker-breaking' && id !== 'score-breaking');
  if (hadBreakingFrame && !flat.includes('breaking')) flat.push('breaking');
  const seen = new Set();
  flat = flat.filter(id => (seen.has(id) ? false : (seen.add(id), true)));
  OVERLAY_GRAPHICS.forEach(g => { if (g.id !== 'komm' && !flat.includes(g.id)) flat.push(g.id); });
  overlayLagOrder = flat;
  tickerLagOrder  = [];
  saveOverlayLagOrder();
  // Ryd gammel ticker_lag_order i DB → overlay.html skifter til flad tilstand
  try { sbUpsert('settings', { projekt_id: aktivProjektId, key: 'ticker_lag_order', value: '' }); } catch {}
}

// Hvilket overlay en grafik ligger på. komm er låst til Secondary; opstilling
// (overlay-3) er selve Fullscreen-sidens indhold og er derfor låst til Fullscreen.
function _composerTargetOf(id) {
  if (id === 'komm') return 'komm';
  if (id === 'overlay-3') return 'overlay-3';
  if (id.startsWith('custom-')) {
    const g = (customGrafik || []).find(x => 'custom-' + x.id.slice(0, 8) === id);
    return (g && g.overlay_target) || 'hoved';
  }
  return grafikOverlayMap[id] || 'hoved';
}

// Hvilke grafikker hvert overlay-vindue faktisk kan vise (matcher overlay-sidernes
// BUILTIN_GRAPHICS). breaking/score findes kun som frames på Master. Customs kan hostes
// af alle tre. Bruges til at afvise flyt der ellers ville få grafikken til at forsvinde.
const _COMPOSER_HOST = {
  'hoved':     ['lower-third', 'ticker', 'breaking', 'score', 'live-boks', 'overlay-3', 'credits'],
  'komm':      ['lower-third', 'ticker', 'live-boks', 'overlay-3', 'credits'],
  'overlay-3': ['lower-third', 'ticker', 'live-boks', 'credits'],
};
function _composerCanHost(id, overlay) {
  if (id.startsWith('custom-')) return ['hoved', 'komm', 'overlay-3'].includes(overlay);
  return (_COMPOSER_HOST[overlay] || []).includes(id);
}

// Label/farve/live-status for et komponist-punkt. Standalone customs hører ikke til.
function _composerItemMeta(id) {
  if (id.startsWith('custom-')) {
    const g = (customGrafik || []).find(x => 'custom-' + x.id.slice(0, 8) === id);
    if (!g || g.overlay_mode === 'standalone') return null;
    return { id, label: g.label, color: g.color || '#888888', live: (grafiktState[g.trigger_key] || 'out') !== 'out' };
  }
  const og = OVERLAY_GRAPHICS.find(x => x.id === id);
  if (!og || og.id === 'komm') return null;
  return { id, label: og.label, color: og.color, live: (grafiktState[og.triggerKey] || 'out') !== 'out' };
}

function _composerColumnItems(overlayKey) {
  const items = [];
  overlayLagOrder.forEach(id => {
    if (id === 'komm' || id === 'overlay-3') return; // låste punkter håndteres nedenfor
    if (_composerTargetOf(id) !== overlayKey) return;
    const meta = _composerItemMeta(id);
    if (meta) items.push(meta);
  });
  if (overlayKey === 'komm') {
    const kommLive = KOMM_BOKSE.some(k => (grafiktState[k.triggerKey] || 'out') !== 'out');
    items.push({ id: 'komm', label: 'Kommentator-bokse', color: '#4a9eff', live: kommLive, locked: true, lockHint: 'Kommentator-bokse vises altid på Secondary' });
  }
  if (overlayKey === 'overlay-3') {
    const og = OVERLAY_GRAPHICS.find(x => x.id === 'overlay-3');
    const live = (grafiktState['lineup_trigger'] || 'out') !== 'out';
    items.push({ id: 'overlay-3', label: 'Opstilling', color: og ? og.color : '#ff8833', live, locked: true, lockHint: 'Opstillingen ER selve Fullscreen-overlayet' });
  }
  return items;
}

function _composerGridHTML() {
  return COMPOSER_OVERLAYS.map(ov => {
    const rows = _composerColumnItems(ov.key).map(m => `
      <div class="comp-row${m.locked ? ' locked' : ''}" draggable="${m.locked ? 'false' : 'true'}" data-cid="${m.id}"${m.lockHint ? ` title="${esc(m.lockHint)}"` : ''}>
        <span class="comp-handle">${m.locked ? '🔒' : '⠿'}</span>
        <span class="gops-status ${m.live ? 'live' : 'off'}">${m.live ? 'LIVE' : 'OFF'}</span>
        <span class="comp-label" style="color:${m.color || '#ccc'}">${esc(m.label)}</span>
      </div>`).join('') || '<div class="comp-empty">Ingen grafik her</div>';
    return `<div class="comp-col">
        <div class="comp-col-head">${ov.label}<span class="comp-col-hint">${ov.hint}</span></div>
        <div class="comp-col-list" data-overlay="${ov.key}">${rows}</div>
      </div>`;
  }).join('');
}

// Flyt en custom-grafik til et andet overlay (overlay_target på projekt_grafik-rækken).
async function setCustomGrafikTarget(shortId, target) {
  const g = (customGrafik || []).find(x => 'custom-' + x.id.slice(0, 8) === shortId);
  if (!g) return;
  g.overlay_target = target;
  try { await sbPatch('projekt_grafik?id=eq.' + g.id, { overlay_target: target }); }
  catch { toast('Fejl ved flyt', 'err'); }
}

function initComposerDnd() {
  const grid = document.querySelector('.comp-grid');
  if (!grid || grid.dataset.dndInit) return;
  grid.dataset.dndInit = '1';
  let dragId = null;

  const clear = () => grid.querySelectorAll('.drag-over, .comp-col-list.drag-target')
    .forEach(el => el.classList.remove('drag-over', 'drag-target'));

  grid.addEventListener('dragstart', e => {
    const row = e.target.closest('.comp-row');
    if (!row || row.classList.contains('locked')) { e.preventDefault(); return; }
    dragId = row.dataset.cid;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => row.classList.add('dragging'), 0);
  });
  grid.addEventListener('dragend', () => {
    grid.querySelectorAll('.dragging').forEach(r => r.classList.remove('dragging'));
    clear(); dragId = null;
  });
  grid.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clear();
    const row = e.target.closest('.comp-row');
    const list = e.target.closest('.comp-col-list');
    if (row && row.dataset.cid !== dragId) row.classList.add('drag-over');
    else if (list) list.classList.add('drag-target');
  });
  grid.addEventListener('drop', async e => {
    e.preventDefault();
    const list = e.target.closest('.comp-col-list');
    clear();
    if (!dragId || !list) { dragId = null; return; }
    const id = dragId; dragId = null;
    const newOverlay = list.dataset.overlay;
    const oldOverlay = _composerTargetOf(id);
    if (newOverlay !== oldOverlay && !_composerCanHost(id, newOverlay)) {
      const ovLabel = (COMPOSER_OVERLAYS.find(o => o.key === newOverlay) || {}).label || newOverlay;
      toast((_composerItemMeta(id)?.label || 'Grafik') + ' kan ikke ligge på ' + ovLabel, 'err');
      return;
    }
    const targetRow  = e.target.closest('.comp-row');

    // Ny flad rækkefølge (øverst = forrest)
    const arr = overlayLagOrder.filter(x => x !== id);
    let insertIdx;
    if (targetRow && targetRow.dataset.cid !== id && arr.includes(targetRow.dataset.cid)) {
      const tIdx = arr.indexOf(targetRow.dataset.cid);
      const rect = targetRow.getBoundingClientRect();
      insertIdx = (e.clientY < rect.top + rect.height / 2) ? tIdx : tIdx + 1;
    } else {
      // Slip på tom kolonne-baggrund → nederst i den kolonne
      let last = -1;
      arr.forEach((x, i) => { if (_composerTargetOf(x) === newOverlay) last = i; });
      insertIdx = last >= 0 ? last + 1 : arr.length;
    }
    arr.splice(insertIdx, 0, id);
    overlayLagOrder = arr;

    // Skift overlay hvis kolonne ændret
    const tasks = [saveOverlayLagOrder()];
    if (oldOverlay !== newOverlay) {
      if (id.startsWith('custom-')) {
        tasks.push(setCustomGrafikTarget(id, newOverlay));
      } else {
        grafikOverlayMap = { ...grafikOverlayMap, [id]: newOverlay };
        tasks.push(sbUpsert('settings', { projekt_id: aktivProjektId, key: 'grafik_overlay_map', value: JSON.stringify(grafikOverlayMap) }));
      }
    }
    renderGrafikOps();
    try { await Promise.all(tasks); } catch { toast('Fejl ved gem', 'err'); }
  });
}


// ── GRAFIK OPS — skabelon-generator ───────────────────────────
function _buildTemplateHtml(type, trigKey, fields, autoHideSec) {
  const ahs = Math.max(0, parseInt(autoHideSec) || 0);
  const f = fields || {};
  const pid = aktivProjektId;

  let css = '', bodyHtml = '', animIn = '', animOut = '';

  if (type === 'lower_third') {
    const c = f.farve || '#4a9eff';
    css = `body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden;background:transparent;font-family:'Segoe UI',Arial,sans-serif;}
#lt{position:absolute;bottom:120px;left:80px;opacity:0;transform:translateY(20px);transition:opacity .4s,transform .4s;}
#lt.in{opacity:1;transform:translateY(0);}
#bar{width:4px;height:60px;background:${c};display:inline-block;vertical-align:middle;margin-right:12px;}
#navn{font-size:36px;font-weight:700;color:#fff;text-shadow:1px 1px 3px rgba(0,0,0,.8);}
#titel{font-size:22px;color:${c};margin-top:4px;}`;
    bodyHtml = `<div id="lt"><span id="bar"></span><div style="display:inline-block;vertical-align:middle;"><div id="navn">${f.navn || ''}</div><div id="titel">${f.titel || ''}</div></div></div>`;
    animIn  = `document.getElementById('lt').classList.add('in');`;
    animOut = `document.getElementById('lt').classList.remove('in');`;
  } else if (type === 'bug') {
    const pos = f.position || 'tl';
    const posStyle = pos === 'tl' ? 'top:40px;left:40px;' : pos === 'tr' ? 'top:40px;right:40px;' : pos === 'bl' ? 'bottom:80px;left:40px;' : 'bottom:80px;right:40px;';
    css = `body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden;background:transparent;font-family:'Segoe UI',Arial,sans-serif;}
#bug{position:absolute;${posStyle}background:rgba(0,0,0,.75);color:#fff;padding:10px 18px;border-radius:6px;font-size:22px;font-weight:700;opacity:0;transition:opacity .3s;}
#bug.in{opacity:1;}`;
    bodyHtml = `<div id="bug">${f.tekst || ''}</div>`;
    animIn  = `document.getElementById('bug').classList.add('in');`;
    animOut = `document.getElementById('bug').classList.remove('in');`;
  } else if (type === 'fullscreen') {
    const bg = f.baggrund || '#000000';
    css = `body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden;background:${bg};font-family:'Segoe UI',Arial,sans-serif;}
#fs{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity .5s;}
#fs.in{opacity:1;}
#fs-title{font-size:72px;font-weight:900;color:#fff;text-align:center;}
#fs-sub{font-size:36px;color:rgba(255,255,255,.7);margin-top:16px;text-align:center;}`;
    bodyHtml = `<div id="fs"><div id="fs-title">${f.overskrift || ''}</div><div id="fs-sub">${f.undertekst || ''}</div></div>`;
    animIn  = `document.getElementById('fs').classList.add('in');`;
    animOut = `document.getElementById('fs').classList.remove('in');`;
  } else if (type === 'timer') {
    const fra = parseInt(f.fra) || 0;
    const fmt = f.format || 'mm:ss';
    css = `body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden;background:transparent;font-family:'Segoe UI',Arial,sans-serif;}
#timer{position:absolute;top:40px;right:80px;font-size:64px;font-weight:900;color:#fff;text-shadow:2px 2px 6px rgba(0,0,0,.9);opacity:0;transition:opacity .3s;}
#timer.in{opacity:1;}`;
    bodyHtml = `<div id="timer">00:00</div>`;
    const fmtFn = fmt === 'mm:ss'
      ? `function _fmt(s){var m=Math.floor(s/60);return String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}`
      : `function _fmt(s){return String(s);}`;
    animIn  = `document.getElementById('timer').classList.add('in');_tSec=${fra};_tEl=document.getElementById('timer');_tEl.textContent=_fmt(_tSec);_tInt=setInterval(function(){_tSec++;_tEl.textContent=_fmt(_tSec);},1000);`;
    animOut = `document.getElementById('timer').classList.remove('in');clearInterval(_tInt);`;
    css = css + `\n/* timer vars */`;
    bodyHtml = bodyHtml + `<script>var _tSec=0,_tEl,_tInt;${fmtFn}<\/script>`;
  }

  const autoHideJs = ahs > 0 ? `var _aht=null;var _origIN=window.runAnimationIN;window.runAnimationIN=function(){clearTimeout(_aht);_aht=null;_origIN.apply(this,arguments);_aht=setTimeout(function(){_aht=null;window.runAnimationOUT();},${ahs}*1000);};` : '';
  const wsBlock = `document.addEventListener('DOMContentLoaded',function(){
var _pid=${JSON.stringify(pid)},_key=${JSON.stringify(trigKey)},_ahs=${ahs},_aht=null;
${autoHideJs}
var _ws,_ref=0,_hb;
function _connect(){try{_ws=new WebSocket('wss://rxzxdcweqpbnvfkpnnrn.supabase.co/realtime/v1/websocket?apikey=${SB_ANON}&vsn=1.0.0');_ws.onopen=function(){_ws.send(JSON.stringify({topic:'realtime:triggers-'+_pid,event:'phx_join',payload:{config:{broadcast:{self:false,ack:false},presence:{key:''},postgres_changes:[{event:'UPDATE',schema:'public',table:'settings',filter:'projekt_id=eq.'+_pid}]},access_token:'${SB_ANON}'},ref:String(++_ref)}));_hb=setInterval(function(){if(_ws&&_ws.readyState===1)_ws.send(JSON.stringify({topic:'phoenix',event:'heartbeat',payload:{},ref:String(++_ref)}));},25000);};_ws.onmessage=function(e){try{var msg=JSON.parse(e.data);if(!msg||msg.event!=='postgres_changes')return;var rec=msg.payload&&msg.payload.data&&msg.payload.data.record;if(!rec||rec.key!==_key)return;if(rec.value==='in')window.runAnimationIN();if(rec.value==='out'&&typeof window.runAnimationOUT==='function')window.runAnimationOUT();}catch(x){}};_ws.onclose=function(){clearInterval(_hb);_hb=null;setTimeout(_connect,3000);};_ws.onerror=function(){try{_ws.close();}catch(x){}};} catch(x){setTimeout(_connect,3000);}}
_connect();});`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>${css}</style></head>
<body>
${bodyHtml}
<script>
var _trigKey='${trigKey}';
var _spxVisible=false;
function runAnimationIN(){_spxVisible=true;${animIn}}
function runAnimationOUT(){_spxVisible=false;${animOut}}
${wsBlock}
<\/script>
</body></html>`;
}

// ── GRAFIK OPS ─────────────────────────────────────────────────
function renderGrafikOps() {
  const el = document.getElementById('grafikOpsList');
  if (!el) return;
  const origin = location.origin;
  const pid = aktivProjektId;

  // ─ Sektion: OVERLAY VINDUER ─
  const builtinWindows = [
    { label: 'Hoved Overlay', url: `${origin}/overlay.html?p=${pid}` },
    { label: 'Kommentator', url: `${origin}/overlay-komm.html?p=${pid}` },
    { label: 'Overlay 3', url: `${origin}/overlay-3.html?p=${pid}` },
  ];
  (customGrafik || []).filter(g => g.overlay_mode === 'standalone').forEach(g => {
    const inputNr = g.overlay_input ? `Input ${g.overlay_input}  ` : '';
    builtinWindows.push({ label: inputNr + g.label, url: g.file_url + '?p=' + pid });
  });
  const overlayRows = builtinWindows.map(w => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #1a1a1a;">
      <span style="flex:1;font-size:11px;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${w.url}">${w.label}</span>
      <span style="font-size:11px;color:#8c8c8c;flex:2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${w.url}</span>
      <button class="copy-btn icon-btn" data-copy="${w.url}" style="padding:3px 8px;background:#222;border:1px solid #333;color:#aaa;border-radius:4px;cursor:pointer;font-size:11px;">⎘</button>
    </div>`).join('');

  // ─ Sektion: OVERLAY-KOMPONIST ─
  const composerGrid = _composerGridHTML();

  // ─ Sektion: EGNE GRAFIKKER ─
  const grafikkort = (customGrafik || []).map(g => {
    const isLive = grafiktState[g.trigger_key] === 'in';
    const targetLabel = g.overlay_target === 'komm' ? 'Kommentator' : 'Hoved Overlay';
    const tilstand = g.overlay_mode === 'standalone' ? `Standalone${g.overlay_input ? ' · Input ' + g.overlay_input : ''}` : `Indlejret i ${targetLabel}`;
    const fileUrlWithPid = g.overlay_mode === 'standalone' ? (g.file_url + '?p=' + pid) : null;
    const onUrl  = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=${encodeURIComponent(g.trigger_key)}&value=in`;
    const offUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=${encodeURIComponent(g.trigger_key)}&value=out`;
    const vMixUrlRow = fileUrlWithPid ? `
      <div style="margin:6px 0 4px;">
        <div style="font-size:11px;color:#9c9c9c;letter-spacing:1px;margin-bottom:3px;">URL TIL VMIX</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="flex:1;font-size:11px;color:#aaa;background:#0d0d0d;border:1px solid #2a2a2a;padding:4px 6px;border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${fileUrlWithPid}</span>
          <button class="copy-btn icon-btn" data-copy="${fileUrlWithPid}" style="padding:3px 7px;background:#222;border:1px solid #333;color:#aaa;border-radius:4px;cursor:pointer;font-size:11px;">⎘</button>
        </div>
      </div>` : '';
    return `
    <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:12px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="gops-status ${isLive ? 'live' : 'off'}">${isLive ? 'LIVE' : 'OFF'}</span>
          <span style="font-size:13px;color:#eee;font-weight:600;">${esc(g.label)}</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button data-edit-id="${g.id}" style="padding:3px 8px;background:#222;border:1px solid #333;color:#aaa;border-radius:4px;cursor:pointer;font-size:11px;">✎</button>
          <button data-del-id="${g.id}" data-del-path="${g.file_path || ''}" data-del-label="${esc(g.label)}" style="padding:3px 8px;background:#2a1010;border:1px solid #4a2020;color:#ef4444;border-radius:4px;cursor:pointer;font-size:11px;">🗑</button>
        </div>
      </div>
      <div style="font-size:11px;color:#8c8c8c;margin-bottom:4px;">${tilstand} · <span style="color:#4a9eff;">${esc(g.trigger_key)}</span>${g.auto_hide_seconds > 0 ? ` · auto-skjul ${g.auto_hide_seconds}s` : ''}</div>
      <details class="gops-links">
        <summary class="gops-links-summary">vMix-URL &amp; Companion-links</summary>
        <div style="margin-top:6px;">
          ${vMixUrlRow}
          <div style="font-size:11px;color:#9c9c9c;letter-spacing:1px;margin:6px 0 4px;">COMPANION LINKS</div>
          <div style="display:flex;flex-direction:column;gap:3px;">
            <div style="display:flex;align-items:center;gap:5px;">
              <span style="width:22px;font-size:11px;color:#86efac;">PÅ</span>
              <span style="flex:1;font-size:11px;color:#aaa;background:#0d0d0d;border:1px solid #2a2a2a;padding:3px 6px;border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${onUrl}</span>
              <button class="copy-btn icon-btn" data-copy="${onUrl}" style="padding:3px 7px;background:#222;border:1px solid #333;color:#aaa;border-radius:4px;cursor:pointer;font-size:11px;">⎘</button>
            </div>
            <div style="display:flex;align-items:center;gap:5px;">
              <span style="width:22px;font-size:11px;color:#ef4444;">AF</span>
              <span style="flex:1;font-size:11px;color:#aaa;background:#0d0d0d;border:1px solid #2a2a2a;padding:3px 6px;border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${offUrl}</span>
              <button class="copy-btn icon-btn" data-copy="${offUrl}" style="padding:3px 7px;background:#222;border:1px solid #333;color:#aaa;border-radius:4px;cursor:pointer;font-size:11px;">⎘</button>
            </div>
          </div>
        </div>
      </details>
      <div style="display:flex;gap:6px;margin-top:10px;">
        <button data-trig="${esc(g.trigger_key)}" data-val="out" style="flex:1;padding:6px;background:#2a1010;border:1px solid #4a2020;color:#ef4444;border-radius:6px;cursor:pointer;font-size:11px;">&#60; AF</button>
        <button data-trig="${esc(g.trigger_key)}" data-val="in" style="flex:2;padding:6px;background:#1a3a1a;border:1px solid #2d5a2d;color:#86efac;border-radius:6px;cursor:pointer;font-size:11px;">&#9654; PÅ</button>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="max-width:800px;margin:0 auto;padding:16px;">
      <details class="gops-section" style="margin-bottom:14px;">
        <summary class="gops-summary">OVERLAY VINDUER <span class="gops-summary-hint">— vMix browser-inputs (engangs-setup)</span></summary>
        <div style="font-size:11px;color:#8c8c8c;margin:6px 0 8px;">Indsæt disse URLs i vMix som Browser-inputs. Standalone grafikker under EGNE GRAFIKKER dukker automatisk op her.</div>
        <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:8px 12px;">${overlayRows}</div>
      </details>
      <details open class="gops-section" style="margin-bottom:14px;">
        <summary class="gops-summary">OVERLAY-KOMPONIST <span class="gops-summary-hint">— placér &amp; stabl grafik pr. overlay</span></summary>
        <div style="font-size:11px;color:#8c8c8c;margin:6px 0 10px;">Øverst = forrest i vMix. Træk lodret for z-orden · træk mellem kolonner for at flytte til et andet overlay. Ændringer slår igennem live.</div>
        <div class="comp-grid">${composerGrid}</div>
      </details>
      <details open class="gops-section">
        <summary class="gops-summary">EGNE GRAFIKKER</summary>
        <div style="display:flex;justify-content:flex-end;margin:8px 0 10px;">
          <button id="gops-add-btn" style="padding:5px 12px;background:#1a2a3a;border:1px solid #1d4ed8;color:#93c5fd;border-radius:6px;cursor:pointer;font-size:11px;letter-spacing:1px;">＋ Tilføj ny grafik</button>
        </div>
        ${grafikkort || '<div style="color:#8c8c8c;font-size:12px;padding:16px 0;">Ingen grafikker endnu. Klik "＋ Tilføj ny grafik" for at starte.</div>'}
      </details>
    </div>`;

  // Event delegation — ingen inline onclick (undgår JSON.stringify HTML-escaping-bug)
  el.querySelectorAll('[data-copy]').forEach(btn =>
    btn.addEventListener('click', () => copyText(btn.dataset.copy)));
  el.querySelectorAll('[data-edit-id]').forEach(btn =>
    btn.addEventListener('click', () => openEgneGrafikModal(btn.dataset.editId)));
  el.querySelectorAll('[data-del-id]').forEach(btn =>
    btn.addEventListener('click', () => _grafikOpsDeleteConfirm(btn, btn.dataset.delId, btn.dataset.delPath, btn.dataset.delLabel)));
  el.querySelectorAll('[data-trig][data-val]').forEach(btn =>
    btn.addEventListener('click', () => { setGrafiktTrigger(btn.dataset.trig, btn.dataset.val); renderGrafikOps(); }));
  el.querySelector('#gops-add-btn')?.addEventListener('click', () => openEgneGrafikModal());
  initComposerDnd();
}

function _grafikOpsDeleteConfirm(btn, id, filePath, label) {
  const wrap = btn.parentElement;
  if (wrap.dataset.confirming) return;
  wrap.dataset.confirming = '1';
  const shortLabel = label.length > 22 ? label.slice(0, 22) + '…' : label;
  const origHTML = wrap.innerHTML;
  wrap.innerHTML = `
    <span style="font-size:11px;color:#ef4444;margin-right:6px;">Slet "${shortLabel}"?</span>
    <button id="_gops_ja" style="padding:3px 9px;background:#4a1010;border:1px solid #ef4444;color:#ef4444;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;">Ja, slet</button>
    <button id="_gops_ann" style="padding:3px 9px;background:#222;border:1px solid #444;color:#aaa;border-radius:4px;cursor:pointer;font-size:11px;">Annuller</button>`;
  wrap.querySelector('#_gops_ja').onclick = () => deleteEgneGrafikById(id, filePath, label);
  wrap.querySelector('#_gops_ann').onclick = () => { delete wrap.dataset.confirming; wrap.innerHTML = origHTML; };
}
