
async function loadKunstomGrafik() {
  if (!aktivProjektId) return;
  try {
    customGrafik = await sbGet('projekt_grafik?projekt_id=eq.' + aktivProjektId + '&order=sort_order');
  } catch { customGrafik = []; }
  customGrafik.forEach(g => BROADCAST_TRIGGER_KEYS.add(g.trigger_key));
  const validCustomIds = new Set(customGrafik.map(g => 'custom-' + g.id.slice(0, 8)));
  // Fjern udgaaede custom-IDs fra begge lister
  overlayLagOrder = overlayLagOrder.filter(id => !id.startsWith('custom-') || validCustomIds.has(id));
  tickerLagOrder  = tickerLagOrder.filter(id => !id.startsWith('custom-') || validCustomIds.has(id));
  // Tilfoej nye custom-IDs til overlayLagOrder hvis de ikke er i hverken main eller ticker
  customGrafik.forEach(g => {
    const shortId = 'custom-' + g.id.slice(0, 8);
    if (!overlayLagOrder.includes(shortId) && !tickerLagOrder.includes(shortId))
      overlayLagOrder.push(shortId);
  });
}

async function loadMakroer() {
  if (!aktivProjektId) return;
  try {
    makroer = await sbGet('projekt_makroer?projekt_id=eq.' + aktivProjektId + '&order=sort_order');
  } catch { makroer = []; }
}

async function _fireOneHandling(h, slotOverride) {
  if (h.key === 'lt_trigger') {
    const raw = slotOverride || (h.value === 'vmixcall' ? 'v' + (h.slot || '') : (h.slot || ''));
    const isVmix = raw.startsWith('v');
    const slotNum = isVmix ? raw.slice(1) : raw;
    const triggerVal = isVmix ? 'vmixcall' : (raw ? 'in' : h.value);
    if (slotNum) {
      await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_slot', value: slotNum });
      grafiktState['lt_slot'] = slotNum;
    }
    await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_trigger', value: triggerVal, slot: slotNum || undefined });
    grafiktState['lt_trigger'] = triggerVal;
    return;
  }
  if (h.key === 'komm_alle') {
    const kommKeys = KOMM_BOKSE.map(k => k.triggerKey);
    if (h.value === 'out') {
      kommKeys.forEach(k => { grafiktState[k] = 'out'; });
      await Promise.all(kommKeys.map(k => sbUpsert('settings', { projekt_id: aktivProjektId, key: k, value: 'out' })));
    } else {
      let activeSlots = [];
      try {
        const rows = await sbGet('kampe?projekt_id=eq.' + aktivProjektId + '&on_air=eq.true&select=slot');
        activeSlots = rows.map(r => r.slot).filter(s => s >= 1 && s <= 6);
      } catch {}
      const onKeys = activeSlots.map(s => `Komm_score_K-${s}`);
      onKeys.forEach(k => { grafiktState[k] = 'in'; });
      if (onKeys.length) await Promise.all(onKeys.map(k => sbUpsert('settings', { projekt_id: aktivProjektId, key: k, value: 'in' })));
    }
    return;
  }
  await sbUpsert('settings', { projekt_id: aktivProjektId, key: h.key, value: h.value });
  grafiktState[h.key] = h.value;
}

async function fireMakro(id, slotOverride = '') {
  const m = makroer.find(x => x.id === id);
  if (!m || !m.handlinger?.length) return;
  try {
    // Gruppér handlinger: wait/alle_af er separatorer — øvrige kører simultant med Promise.all
    const groups = [];
    let cur = [];
    for (const h of m.handlinger) {
      if (h.key === 'wait' || h.key === 'alle_af') {
        if (cur.length) { groups.push(cur); cur = []; }
        groups.push([h]);
      } else { cur.push(h); }
    }
    if (cur.length) groups.push(cur);

    for (const grp of groups) {
      const h0 = grp[0];
      if (h0.key === 'wait') {
        await new Promise(r => setTimeout(r, parseFloat(h0.value) * 1000));
        continue;
      }
      if (h0.key === 'alle_af') {
        const allKeys = [...OVERLAY_GRAPHICS.map(og => og.triggerKey).filter(Boolean), 'score_breaking_trigger'];
        const customKeys = customGrafik.map(g => g.trigger_key);
        OVERLAY_GRAPHICS.forEach(og => { grafiktState[og.triggerKey] = 'out'; });
        grafiktState['score_breaking_trigger'] = 'out';
        customKeys.forEach(k => { grafiktState[k] = 'out'; });
        grafiktState['lt_slot'] = '';
        await Promise.all([
          ...allKeys.map(key => sbUpsert('settings', { projekt_id: aktivProjektId, key, value: 'out' })),
          ...customKeys.map(key => sbUpsert('settings', { projekt_id: aktivProjektId, key, value: 'out' })),
          sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_slot', value: '' }),
        ]);
        continue;
      }
      // Kør alle trin i gruppen simultant
      await Promise.all(grp.map(h => _fireOneHandling(h, slotOverride)));
    }
    renderGrafik();
    toast(m.label + ' kørt', 'ok');
  } catch { toast('Fejl ved makro', 'err'); }
}

async function refreshGrafiktState() {
  const customKeys = customGrafik.map(g => g.trigger_key);
  const kommKeys = KOMM_BOKSE.map(k => k.triggerKey);
  const keys = [...OVERLAY_GRAPHICS.map(g => g.triggerKey).filter(Boolean), ...customKeys, ...kommKeys, 'lt_slot', 'score_breaking_trigger', 'ticker_lag_order', 'lineup_slots', 'grafik_overlay_map'].join(',');
  try {
    const rows = await sbGet('settings?select=key,value&key=in.(' + keys + ')&projekt_id=eq.' + aktivProjektId);
    rows.forEach(r => {
      if (r.key === 'ticker_lag_order') {
        tickerLagOrder = r.value ? r.value.split(',').map(s => s.trim()).filter(Boolean) : [...DEFAULT_TICKER_SUB_ORDER];
        DEFAULT_TICKER_SUB_ORDER.forEach(id => { if (!tickerLagOrder.includes(id)) tickerLagOrder.push(id); });
      } else if (r.key === 'lineup_slots') {
        try { lineupSlots = JSON.parse(r.value); } catch { lineupSlots = {}; }
      } else if (r.key === 'grafik_overlay_map') {
        try { grafikOverlayMap = JSON.parse(r.value); } catch { grafikOverlayMap = {}; }
      } else {
        grafiktState[r.key] = r.value;
      }
    });
  } catch {}
  renderGrafik();
}

async function setGrafiktTrigger(triggerKey, value) {
  grafiktState[triggerKey] = value;
  _debouncedRenderGrafik();
  try {
    await sbUpsert('settings', { projekt_id: aktivProjektId, key: triggerKey, value });
  } catch { toast('Fejl ved trigger', 'err'); }
}

// Vis/skjul komm-boks for en kamp-slot ud fra on-air, gatet af master-kontakten.
// Kaldes fra toggleOnAir (lokal handling) og applyKampRow (ændring fra andet panel).
// On air → vis KUN hvis master er på. Off air → skjul altid (hvis den er på).
function syncKommBoks(slot, onAir) {
  const boks = KOMM_BOKSE.find(k => k.slot === slot);
  if (!boks) return;
  const cur = grafiktState[boks.triggerKey] || 'out';
  if (onAir) {
    if (_kommPaaMode && cur === 'out') setGrafiktTrigger(boks.triggerKey, 'in');
  } else {
    if (cur !== 'out') setGrafiktTrigger(boks.triggerKey, 'out');
  }
}

async function setBuiltinGrafikTarget(grafId, target) {
  grafikOverlayMap = { ...grafikOverlayMap, [grafId]: target };
  try {
    await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'grafik_overlay_map', value: JSON.stringify(grafikOverlayMap) });
    toast('Overlay-vindue opdateret — genindlæs overlays i vMix', 'ok');
  } catch { toast('Fejl ved gem', 'err'); }
  renderGrafikOps();
}

async function saveOverlayLagOrder() {
  try {
    await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'overlay_lag_order', value: overlayLagOrder.join(',') });
  } catch { toast('Fejl ved lag-gem', 'err'); }
}

async function saveTickerLagOrder() {
  try {
    await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'ticker_lag_order', value: tickerLagOrder.join(',') });
  } catch { toast('Fejl ved ticker-lag-gem', 'err'); }
}



// ── GRAFIK TAB ────────────────────────────────────────────────
async function fetchLineupDataForGrafik() {
  const enetIds = kampe.filter(k => k.enetpulseId).map(k => k.enetpulseId);
  if (!enetIds.length) return;
  try {
    const data = await apiFetch('/api/enetpulse?ids=' + enetIds.join(',')).then(r => r.json());
    (data.matches || []).forEach(m => {
      if (!m.id || m.error) return;
      const k = kampe.find(k2 => String(k2.enetpulseId) === String(m.id));
      if (k) {
        if (k.hold1Lang) m.home = k.hold1Lang;
        if (k.hold2Lang) m.away = k.hold2Lang;
      }
      liveMatchData.set(String(m.id), m);
    });
  } catch {}
  renderGrafik();
}

function renderGrafik() {
  const container = document.getElementById('grafikList');
  if (!container) return;

  const origin = window.location.origin;
  const pid    = aktivProjektId;

  // Find aktivt grafik-objekt
  let g = OVERLAY_GRAPHICS.find(x => x.id === grafiktActiveSubTab);
  const isCustomEmbedTab = grafiktActiveSubTab.startsWith('custom-');
  if (!g && grafiktActiveSubTab !== 'afvikling' && !isCustomEmbedTab) { grafiktActiveSubTab = OVERLAY_GRAPHICS[0].id; g = OVERLAY_GRAPHICS[0]; }
  const isAfvikling = grafiktActiveSubTab === 'afvikling';
  const customEmbedActive = (customGrafik || []).find(x => 'custom-' + x.trigger_key === grafiktActiveSubTab && x.overlay_mode === 'embed');
  if (isCustomEmbedTab && !customEmbedActive) { grafiktActiveSubTab = OVERLAY_GRAPHICS[0].id; g = OVERLAY_GRAPHICS[0]; }

  // ── SUB-TABS ────────────────────────────────────────────────────
  const embedCustomTabs = (customGrafik || []).filter(cg => cg.overlay_mode === 'embed').map(cg => {
    const isActive = grafiktActiveSubTab === 'custom-' + cg.trigger_key;
    const isLive = (grafiktState[cg.trigger_key] || 'out') !== 'out';
    const dot = isLive ? `<span class="grafik-v2-onair"></span>` : '';
    return `<button class="grafik-v2-tab${isActive ? ' active' : ''}" data-gtab="custom-${cg.trigger_key}" style="--tab-color:${cg.color || '#888'}">${esc(cg.label.toUpperCase())}${dot}</button>`;
  }).join('');
  const subTabsHTML = OVERLAY_GRAPHICS.filter(og => !og.subOf).map(og => {
    const isActive = og.id === grafiktActiveSubTab;
    let isOnAir;
    if (og.type === 'lineup') {
      isOnAir = (grafiktState[og.triggerKey] || 'out') !== 'out' || lineupOnAirMatchId !== null;
    } else if (og.type === 'ticker') {
      // dot hvis ticker ELLER breaking ELLER score ELLER custom-i-ticker er live
      const customTickerLive = tickerLagOrder.some(id => {
        if (!id.startsWith('custom-')) return false;
        const cg = customGrafik.find(g => 'custom-' + g.id.slice(0, 8) === id);
        return cg && (grafiktState[cg.trigger_key] || 'out') !== 'out';
      });
      isOnAir = (grafiktState[og.triggerKey] || 'out') !== 'out' ||
                (grafiktState['breaking_trigger'] || 'out') !== 'out' ||
                (grafiktState['score_trigger'] || 'out') !== 'out' ||
                (grafiktState['live_boks_trigger'] || 'out') !== 'out' ||
                customTickerLive;
    } else {
      isOnAir = og.triggerKey ? (grafiktState[og.triggerKey] || 'out') !== 'out' : false;
    }
    const dot = isOnAir ? `<span class="grafik-v2-onair"></span>` : '';
    return `<button class="grafik-v2-tab${isActive ? ' active' : ''}" data-gtab="${og.id}" style="--tab-color:${og.color}">${og.label.toUpperCase()}${dot}</button>`;
  }).join('') + embedCustomTabs + `<button class="grafik-v2-tab${isAfvikling ? ' active' : ''}" data-gtab="afvikling" style="--tab-color:#ff8c00">AFVIKLING</button>`;

  // ── AKTIVT TAB INDHOLD ──────────────────────────────────────────
  const val    = g ? grafiktState[g.triggerKey] || 'out' : 'out';
  const isLive = val !== 'out';

  const liveBadge = isLive
    ? `<span class="credits-live-badge visible" style="font-size:10px;gap:4px;"><span class="credits-live-dot"></span>${
        g.type === 'lineup' ? (val === 'home' ? 'HJEM' : 'UDE') : 'LIVE'
      }</span>`
    : '';

  const overlayUrl       = g ? `${origin}/${g.file}?p=${pid}` : '';
  const combinedUrl      = `${origin}/overlay.html?p=${pid}`;
  const previewIframeUrl = g ? `${origin}/${g.file}?p=${pid}&preview=1` : '';

  let contentHTML = '';

  if (g && g.type === 'lt') {
    const activeLtSlot = grafiktState['lt_slot'] || '';
    const activeLtTrig = grafiktState['lt_trigger'] || 'out';
    const ltSubMode    = activeLtTrig === 'in' || activeLtTrig === 'update';
    const ltVmixMode   = activeLtTrig === 'vmixcall';
    const subRows = subs.map((s, i) => {
      if (!s.navn && !s.titel) return '';
      const slot     = i + 1;
      const slotAct  = ltSubMode && String(activeLtSlot) === String(slot);
      const subMakro = makroer.find(m =>
        m.handlinger?.some(h => h.key === 'lt_trigger' && String(h.slot) === String(slot))
      );
      const makroBtn = subMakro
        ? `<button class="grafik-btn-prw makro-sub-fire-btn" data-makro-id="${subMakro.id}"
             title="${esc(subMakro.label)}" style="color:${subMakro.farve || '#4a9eff'}">▶</button>`
        : `<button class="grafik-btn-prw makro-sub-add-btn" data-slot="${slot}"
             title="Opret makro for denne sub">＋</button>`;
      return `<div class="grafik-block" style="--g-color:${g.color}">
        <span class="grafik-block-num">${slot}</span>
        <div class="grafik-block-info">
          <span class="grafik-block-name${!s.navn ? ' muted' : ''}">${s.navn || '—'}</span>
          ${s.titel ? `<span class="grafik-block-sub">${s.titel}</span>` : ''}
        </div>
        <div class="grafik-block-actions">
          ${makroBtn}
          <button class="grafik-btn-prw${grafiktActivePrvKey === 'lt-'+slot ? ' active' : ''}" data-prv-type="lt" data-prv-slot="${slot}" data-prv-id="lt-${slot}">PRW</button>
          <button class="grafik-btn-out" data-trig="${g.triggerKey}" data-val="out"${!slotAct ? ' disabled' : ''}>&lt; OUT</button>
          <button class="grafik-btn-in${slotAct ? ' on' : ''} grafik-lt-paa" data-slot="${slot}">&gt; IN</button>
        </div>
      </div>`;
    }).filter(Boolean).join('');
    const vmixRows = vmixCalls.map((c, i) => {
      if (!c.navn) return '';
      const slot    = i + 1;
      const vmixAct = ltVmixMode && String(activeLtSlot) === String(slot);
      return `<div class="grafik-block" style="--g-color:#a855f7">
        <span class="grafik-block-num">${slot}</span>
        <div class="grafik-block-info">
          <span class="grafik-block-name">${esc(c.navn) || '—'}</span>
          ${c.titel ? `<span class="grafik-block-sub">${esc(c.titel)}</span>` : ''}
        </div>
        <div class="grafik-block-actions">
          <button class="grafik-btn-prw${grafiktActivePrvKey === 'vmc-'+slot ? ' active' : ''}" data-prv-type="vmixcall" data-prv-slot="${slot}" data-prv-id="vmc-${slot}">PRW</button>
          <button class="grafik-btn-out grafik-vmix-out-btn" data-idx="${i}"${!vmixAct ? ' disabled' : ''}>&lt; OUT</button>
          <button class="grafik-btn-in${vmixAct ? ' on' : ''} grafik-vmix-call-btn" data-idx="${i}">&gt; IN</button>
        </div>
      </div>`;
    }).filter(Boolean).join('');

    const vmixSection = vmixRows
      ? `<div class="grafik-section-head">VMIX CALLS</div>${vmixRows}`
      : '';

    contentHTML = (subRows || `<div class="grafik-v2-empty">Ingen subs — udfyld i SUBS-fanen</div>`) + vmixSection;

  } else if (g && g.type === 'ticker') {
    const breakingVal       = grafiktState['breaking_trigger'] || 'out';
    const breakingLive      = breakingVal !== 'out';
    const breakingScoreLive = (grafiktState['score_breaking_trigger'] || 'out') !== 'out';
    const scoreVal     = grafiktState['score_trigger'] || 'out';
    const scoreLive    = scoreVal !== 'out';
    const liveBoksVal  = grafiktState['live_boks_trigger'] || 'out';
    const liveBoksLive = liveBoksVal !== 'out';
    contentHTML = `
      <div class="grafik-block" style="--g-color:${g.color}">
        <div class="grafik-block-info">
          <span class="grafik-block-name">TICKER</span>
          <span class="grafik-block-sub"${isLive ? ` style="color:var(--g-color)"` : ''}>${isLive ? '● LIVE' : 'IKKE AKTIV'}</span>
        </div>
        <div class="grafik-block-actions">
          <button class="grafik-btn-prw${grafiktActivePrvKey === g.id ? ' active' : ''}" data-prv-type="simple" data-prv-key="${g.triggerKey}" data-prv-id="${g.id}">PRW</button>
          <button class="grafik-btn-out" data-trig="${g.triggerKey}" data-val="out"${!isLive ? ' disabled' : ''}>&lt; OUT</button>
          <button class="grafik-btn-in${isLive ? ' on' : ''}" data-trig="${g.triggerKey}" data-val="in">&gt; IN</button>
        </div>
      </div>
      <div class="grafik-section-head">BREAKING TICKER</div>
      <div class="grafik-block" style="--g-color:#ff4444">
        <div class="grafik-block-info">
          <span class="grafik-block-name">BREAKING TICKER</span>
          <span class="grafik-block-sub"${breakingLive ? ' style="color:#ff4444"' : ''}>${breakingLive ? '● LIVE' : 'IKKE AKTIV'}</span>
        </div>
        <div class="grafik-block-actions">
          <button class="grafik-btn-prw${grafiktActivePrvKey === 'ticker-breaking' ? ' active' : ''}" data-prv-type="simple" data-prv-key="breaking_trigger" data-prv-id="ticker-breaking" data-prv-url="${origin}/Graphics/Ticker/Ticker_breaking_gsap.html?p=${pid}&preview=1">PRW</button>
          <button class="grafik-btn-out" data-trig="breaking_trigger" data-val="out"${!breakingLive ? ' disabled' : ''}>&lt; OUT</button>
          <button class="grafik-btn-in${breakingLive ? ' on' : ''}" data-trig="breaking_trigger" data-val="in">&gt; IN</button>
        </div>
      </div>
      <div class="grafik-section-head">BREAKING STILLINGS BOKS</div>
      <div class="grafik-block" style="--g-color:#ff4444">
        <div class="grafik-block-info">
          <span class="grafik-block-name">BREAKING STILLINGS BOKS</span>
          <span class="grafik-block-sub"${breakingScoreLive ? ' style="color:#ff4444"' : ''}>${breakingScoreLive ? '● LIVE' : 'IKKE AKTIV'}</span>
        </div>
        <div class="grafik-block-actions">
          <button class="grafik-btn-prw${grafiktActivePrvKey === 'score-breaking' ? ' active' : ''}" data-prv-type="simple" data-prv-key="score_breaking_trigger" data-prv-id="score-breaking" data-prv-url="${origin}/Graphics/Stillings_boks/Stillings_boks_BREAKING_uden_live_boks_supabase.html?p=${pid}&preview=1">PRW</button>
          <button class="grafik-btn-out" data-trig="score_breaking_trigger" data-val="out"${!breakingScoreLive ? ' disabled' : ''}>&lt; OUT</button>
          <button class="grafik-btn-in${breakingScoreLive ? ' on' : ''}" data-trig="score_breaking_trigger" data-val="in">&gt; IN</button>
        </div>
      </div>
      <div class="grafik-section-head">STILLINGS BOKS</div>
      <div class="grafik-block" style="--g-color:#44cc88">
        <div class="grafik-block-info">
          <span class="grafik-block-name">STILLINGS BOKS</span>
          <span class="grafik-block-sub"${scoreLive ? ' style="color:#44cc88"' : ''}>${scoreLive ? '● LIVE' : 'IKKE AKTIV'}</span>
        </div>
        <div class="grafik-block-actions">
          <button class="grafik-btn-prw${grafiktActivePrvKey === 'score' ? ' active' : ''}" data-prv-type="simple" data-prv-key="score_trigger" data-prv-id="score" data-prv-url="${origin}/Graphics/Stillings_boks/Stillings_boks_uden_live_boks_gsap.html?p=${pid}&preview=1">PRW</button>
          <button class="grafik-btn-out" data-trig="score_trigger" data-val="out"${!scoreLive ? ' disabled' : ''}>&lt; OUT</button>
          <button class="grafik-btn-in${scoreLive ? ' on' : ''}" data-trig="score_trigger" data-val="in">&gt; IN</button>
        </div>
      </div>
      <div class="grafik-section-head">LIVE BOKS</div>
      <div class="grafik-block" style="--g-color:#ff2244">
        <div class="grafik-block-info">
          <span class="grafik-block-name">LIVE BOKS</span>
          <span class="grafik-block-sub"${liveBoksLive ? ' style="color:#ff2244"' : ''}>${liveBoksLive ? '● LIVE' : 'IKKE AKTIV'}</span>
        </div>
        <div class="grafik-block-actions">
          <button class="grafik-btn-prw${grafiktActivePrvKey === 'live-boks' ? ' active' : ''}" data-prv-type="simple" data-prv-key="live_boks_trigger" data-prv-id="live-boks">PRW</button>
          <button class="grafik-btn-out" data-trig="live_boks_trigger" data-val="out"${!liveBoksLive ? ' disabled' : ''}>&lt; OUT</button>
          <button class="grafik-btn-in${liveBoksLive ? ' on' : ''}" data-trig="live_boks_trigger" data-val="in">&gt; IN</button>
        </div>
      </div>`;

  } else if (g && g.type === 'simple') {
    contentHTML = `
      <div class="grafik-block" style="--g-color:${g.color}">
        <div class="grafik-block-info">
          <span class="grafik-block-name">${g.label.toUpperCase()}</span>
          <span class="grafik-block-sub"${isLive ? ` style="color:var(--g-color)"` : ''}>${isLive ? '● LIVE' : 'IKKE AKTIV'}</span>
        </div>
        <div class="grafik-block-actions">
          <button class="grafik-btn-prw${grafiktActivePrvKey === g.id ? ' active' : ''}" data-prv-type="simple" data-prv-key="${g.triggerKey}" data-prv-id="${g.id}">PRW</button>
          <button class="grafik-btn-out" data-trig="${g.triggerKey}" data-val="out"${!isLive ? ' disabled' : ''}>&lt; OUT</button>
          <button class="grafik-btn-in${isLive ? ' on' : ''}" data-trig="${g.triggerKey}" data-val="in">&gt; IN</button>
        </div>
      </div>`;

  } else if (g && g.type === 'credits') {
    contentHTML = `
      <div class="grafik-block" style="--g-color:${g.color}">
        <div class="grafik-block-info">
          <span class="grafik-block-name">CREDITS</span>
          <span class="grafik-block-sub"${isLive ? ` style="color:var(--g-color)"` : ''}>${isLive ? '● LIVE' : 'IKKE AKTIV'}</span>
        </div>
        <div class="grafik-block-actions">
          <button class="grafik-btn-prw${grafiktActivePrvKey === g.id ? ' active' : ''}" data-prv-type="credits" data-prv-key="${g.triggerKey}" data-prv-id="${g.id}">PRW</button>
          <button class="grafik-btn-out" data-trig="${g.triggerKey}" data-val="out"${!isLive ? ' disabled' : ''}>&lt; OUT</button>
          <button class="grafik-btn-in${isLive ? ' on' : ''}" data-trig="${g.triggerKey}" data-val="in">&gt; IN</button>
        </div>
      </div>`;

  } else if (g && g.type === 'lineup') {
    const isOnAir   = isLive || lineupOnAirMatchId !== null;
    const dashKampe = kampe.filter(k => k.enetpulseId);
    let matchRows;
    if (!dashKampe.length) {
      matchRows = `<div class="grafik-v2-empty">Ingen kampe i Dashboard — tilføj i KAMPE-fanen</div>`;
    } else {
      matchRows = dashKampe.map(k => {
        const matchId    = String(k.enetpulseId);
        const slot       = String(kampe.indexOf(k) + 1);
        const isActive   = String(lineupOnAirMatchId) === matchId;
        const homeActive = isActive && val === 'home';
        const awayActive = isActive && val === 'away';
        const hjemNavn   = k.hold1Lang || k.hold1Kort || '—';
        const udeNavn    = k.hold2Lang || k.hold2Kort || '—';
        const prvHjemId  = `lu-${matchId}-home`;
        const prvUdeId   = `lu-${matchId}-away`;
        const prvUrl     = `${origin}/overlay-3.html?p=${pid}`;
        return `<div class="grafik-block${isActive ? ' active' : ''}" style="--g-color:${g.color}">
          <div class="grafik-block-info">
            <span class="grafik-block-name">${esc(hjemNavn)} <span class="muted">vs</span> ${esc(udeNavn)}</span>
            ${isActive ? `<span class="grafik-block-sub" style="color:var(--g-color)">● ${homeActive ? 'HJEM' : 'UDE'}</span>` : ''}
          </div>
          <div class="grafik-block-actions">
            <button class="grafik-btn-prw${grafiktActivePrvKey === prvHjemId ? ' active' : ''}"
              data-prv-type="lineup" data-prv-side="home" data-prv-matchid="${matchId}" data-prv-slot="${slot}"
              data-prv-id="${prvHjemId}" data-prv-url="${prvUrl}&preview=home">H PRW</button>
            <button class="grafik-btn-prw${grafiktActivePrvKey === prvUdeId ? ' active' : ''}"
              data-prv-type="lineup" data-prv-side="away" data-prv-matchid="${matchId}" data-prv-slot="${slot}"
              data-prv-id="${prvUdeId}" data-prv-url="${prvUrl}&preview=away">U PRW</button>
            <button class="grafik-btn-out grafik-lu-off-btn"${!isOnAir ? ' disabled' : ''}>&lt; OUT</button>
            <button class="grafik-btn-in${homeActive ? ' on' : ''} grafik-lu-btn" data-matchid="${matchId}" data-side="home">HJEM</button>
            <button class="grafik-btn-in${awayActive ? ' on' : ''} grafik-lu-btn" data-matchid="${matchId}" data-side="away">UDE</button>
          </div>
        </div>`;
      }).join('');
    }
    contentHTML = matchRows;

  } else if (g && g.type === 'komm') {
    const anyOn     = KOMM_BOKSE.some(k => (grafiktState[k.triggerKey] || 'out') !== 'out');
    const anyActive = KOMM_BOKSE.some(k => kampe[k.slot - 1]?.onAir === true);
    const rows = KOMM_BOKSE.map(k => {
      const kamp     = kampe[k.slot - 1];
      const isOn     = (grafiktState[k.triggerKey] || 'out') !== 'out';
      const isActive = kamp?.onAir === true;
      const matchTxt = (kamp && kamp.hold1Kort && kamp.hold2Kort)
        ? esc(kamp.hold1Kort) + ' vs ' + esc(kamp.hold2Kort)
        : '—';
      const kommUrl = `${origin}/overlay-komm.html?p=${pid}`;
      return `<div class="grafik-block${isOn ? ' active' : ''}" style="--g-color:${g.color};opacity:${isActive ? 1 : 0.4}">
        <div class="grafik-block-info">
          <span class="grafik-block-name">K-${k.slot} &nbsp; ${matchTxt}</span>
          ${isOn     ? `<span class="grafik-block-sub" style="color:var(--g-color)">● LIVE</span>`
           : isActive ? `<span class="grafik-block-sub" style="color:#555">ON AIR</span>` : ''}
        </div>
        <div class="grafik-block-actions">
          <button class="copy-btn icon-btn" data-copy="${kommUrl}" title="Kopiér overlay URL">⎘</button>
        </div>
      </div>`;
    }).join('');
    contentHTML = `${rows}
      <div class="grafik-block-actions" style="margin-top:8px;justify-content:flex-end;gap:8px;">
        <button class="grafik-btn-out komm-alle-af-btn"${!anyOn ? ' disabled' : ''}>&lt; ALLE AF</button>
        <button class="grafik-btn-in komm-alle-paa-btn"${!anyActive ? ' disabled' : ''}>▶ ALLE PÅ</button>
      </div>`;
  }

  if (customEmbedActive) {
    const cg = customEmbedActive;
    const cgLive = (grafiktState[cg.trigger_key] || 'out') === 'in';
    contentHTML = `
      <div class="grafik-block" style="--g-color:${cg.color || '#888'}">
        <div class="grafik-block-info">
          <span class="grafik-block-name">${esc(cg.label)}</span>
          <span class="grafik-block-sub">Indlejret · ${esc(cg.trigger_key)}</span>
        </div>
        <div class="grafik-block-actions">
          <button class="grafik-btn-out" data-trig="${esc(cg.trigger_key)}" data-val="out"${!cgLive ? ' disabled' : ''}>&lt; AF</button>
          <button class="grafik-btn-in" data-trig="${esc(cg.trigger_key)}" data-val="in"${cgLive ? ' disabled' : ''}>▶ PÅ</button>
        </div>
      </div>`;
  }

  if (isAfvikling) {
    const makroRows = makroer.length
      ? makroer.map(m => {
          const summary = (m.handlinger || []).map(h => {
            if (h.key === 'wait') return `⏱ ${h.value}s`;
            if (h.key === 'alle_af') return '■ ALLE AF';
            if (h.key === 'lt_trigger' && h.slot) {
              const s = subs[parseInt(h.slot) - 1];
              return `Sub${s?.navn ? ': ' + s.navn : ' ' + h.slot}: ${h.value === 'in' ? 'PÅ' : 'AF'}`;
            }
            return `${_makroKeyLabel(h.key)}: ${h.value === 'in' ? 'PÅ' : 'AF'}`;
          }).join(' · ');
          const ltOnStep = (m.handlinger || []).find(h => h.key === 'lt_trigger' && h.value !== 'out');
          let slotPickerHTML = '';
          if (ltOnStep) {
            const encodedSlot = ltOnStep.value === 'vmixcall' ? 'v' + (ltOnStep.slot || '') : (ltOnStep.slot || '');
            const opts = _buildLtSlotOpts(encodedSlot);
            if ((opts.match(/<option/g) || []).length > 1) {
              slotPickerHTML = `<select class="afv-slot-sel" style="background:#111;border:1px solid #333;color:#ccc;padding:4px 6px;border-radius:5px;font-size:11px;">${opts}</select>`;
            }
          }
          return `<div class="grafik-block afv-makro-row" draggable="true" data-makro-id="${m.id}" style="--g-color:${m.farve || '#4a9eff'}">
            <span class="afv-drag-handle" style="color:#555;font-size:18px;user-select:none;flex-shrink:0;cursor:grab;padding:0 6px 0 2px;">⠿</span>
            <div class="grafik-block-info">
              <span class="grafik-block-name">${esc(m.label.toUpperCase())}</span>
              ${summary ? `<span class="grafik-block-sub" style="color:#555">${esc(summary)}</span>` : ''}
            </div>
            <div class="grafik-block-actions">
              <button class="grafik-btn-prw afv-edit-btn" data-id="${m.id}" title="Redigér">✎</button>
              ${slotPickerHTML}
              <button class="grafik-btn-in afv-fire-btn" style="background:${m.farve || '#4a9eff'}22;border-color:${m.farve || '#4a9eff'}66;color:${m.farve || '#4a9eff'}" data-id="${m.id}">▶ KØR</button>
            </div>
          </div>`;
        }).join('')
      : `<div class="grafik-v2-empty">Ingen makroer — opret dem via ＋ Tilføj</div>`;
    contentHTML = `
      <div class="grafik-section-head" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        MAKROER
        <button class="grafik-btn-prw" style="padding:3px 8px;font-size:10px;border-radius:4px;" onclick="openMakroModal()">＋ Tilføj</button>
      </div>
      <div id="afv-makro-list">${makroRows}</div>`;
  }

  // ── HØJRE PANEL: PREVIEW ─────────────────────────────────────────
  const prvSrc = (!isAfvikling && !customEmbedActive && grafiktActivePrvKey)
    ? (g && g.type === 'vmixcalls' ? combinedUrl : previewIframeUrl)
    : 'about:blank';
  const previewHTML = `
    <div>
      <div class="grafik-companion-head" style="margin-bottom:6px;">PREVIEW</div>
      <div class="grafik-preview-box">
        <iframe class="grafik-preview-iframe" src="${prvSrc}"></iframe>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        <button class="grafik-btn-out" id="grafik-prw-out-btn" style="flex:1;font-size:10px;">&lt; PRW UD</button>
        <button class="btn btn-cancel btn-sm" style="flex:1;font-size:10px;min-width:0;" data-copy="${previewIframeUrl}">Kopiér preview URL ⎘</button>
        <button class="btn btn-cancel btn-sm" style="flex:1;font-size:10px;min-width:0;" data-copy="${combinedUrl}">vMix overlay URL ⎘</button>
      </div>
    </div>
    <div>
      <div class="grafik-companion-head" style="margin-bottom:6px;">ON AIR</div>
      <div class="grafik-preview-box">
        <iframe class="grafik-onair-iframe" src="${combinedUrl}"></iframe>
      </div>
    </div>
    <div style="margin-top:10px;">
      <div class="grafik-companion-head" style="margin-bottom:6px;">KOMM OVERLAY</div>
      <div class="grafik-preview-box">
        <iframe class="grafik-onair-iframe" src="${origin}/overlay-komm.html?p=${pid}"></iframe>
      </div>
      <div style="display:flex;gap:6px;margin-top:6px;align-items:center;">
        <span class="grafik-companion-url" style="flex:1;font-size:10px;color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
          title="${origin}/overlay-komm.html?p=${pid}">${origin}/overlay-komm.html?p=${pid}</span>
        <button class="copy-btn icon-btn" data-copy="${origin}/overlay-komm.html?p=${pid}">⎘</button>
      </div>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="grafik-btn-out komm-alle-af-btn" style="flex:1">&lt; AF</button>
        <button class="grafik-btn-in komm-alle-paa-btn" style="flex:1">▶ PÅ</button>
      </div>
    </div>`;

  // ── HØJRE PANEL: COMPANION URLS ──────────────────────────────────
  let companionRows = '';
  if (!isAfvikling && g && g.type === 'lt') {
    const slotRows = subs.map((s, i) => {
      const slot = i + 1;
      const url  = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=lt_trigger&value=in&slot=${slot}`;
      return `<div class="grafik-companion-row">
        <span class="grafik-companion-lbl">Sub ${slot}</span>
        <span class="grafik-companion-url" title="${url}">${url}</span>
        <button class="copy-btn icon-btn" data-copy="${url}">⎘</button>
      </div>`;
    }).join('');
    const vmixRows = vmixCalls.map((c, i) => {
      const slot = i + 1;
      const url  = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=lt_trigger&value=vmixcall&slot=${slot}`;
      return `<div class="grafik-companion-row">
        <span class="grafik-companion-lbl" style="color:#a855f7">VMC ${slot}</span>
        <span class="grafik-companion-url" title="${url}">${url}</span>
        <button class="copy-btn icon-btn" data-copy="${url}">⎘</button>
      </div>`;
    }).join('');
    const afUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=lt_trigger&value=out`;
    const afRow = `<div class="grafik-companion-row">
      <span class="grafik-companion-lbl">AF</span>
      <span class="grafik-companion-url" title="${afUrl}">${afUrl}</span>
      <button class="copy-btn icon-btn" data-copy="${afUrl}">⎘</button>
    </div>`;
    const vmixHead = vmixRows ? `<div class="grafik-companion-subhead">VMIX CALLS</div>` : '';
    companionRows = (slotRows ? `<div class="grafik-companion-subhead">SUBS</div>${slotRows}` : '') +
                   vmixHead + vmixRows + afRow;
  } else if (!isAfvikling && g && g.type === 'credits') {
    const paUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=credits_trigger&value=in`;
    const afUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=credits_trigger&value=out`;
    companionRows = `
      <div class="grafik-companion-row">
        <span class="grafik-companion-lbl">PÅ</span>
        <span class="grafik-companion-url" title="${paUrl}">${paUrl}</span>
        <button class="copy-btn icon-btn" data-copy="${paUrl}">⎘</button>
      </div>
      <div class="grafik-companion-row">
        <span class="grafik-companion-lbl">AF</span>
        <span class="grafik-companion-url" title="${afUrl}">${afUrl}</span>
        <button class="copy-btn icon-btn" data-copy="${afUrl}">⎘</button>
      </div>`;
  } else if (!isAfvikling && g && g.type === 'lineup') {
    const afUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=lineup_trigger&value=out`;
    const lineupKampe = kampe.filter(k => k.enetpulseId);
    if (!lineupKampe.length) {
      companionRows = `<div style="color:#666;font-size:11px;padding:4px 0">Ingen kampe med Enetpulse ID</div>`;
    } else {
      const kampRows = lineupKampe.map(k => {
        const slot    = kampe.indexOf(k) + 1;
        const hjemUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=lineup_trigger&value=home&slot=${slot}`;
        const udeUrl  = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=lineup_trigger&value=away&slot=${slot}`;
        const label   = k.hold1Kort && k.hold2Kort ? `${esc(k.hold1Kort)} vs ${esc(k.hold2Kort)}` : `Kamp ${slot}`;
        return `
        <div style="font-size:10px;color:#666;margin-top:6px;padding-top:6px;border-top:1px solid #222">${label}</div>
        <div class="grafik-companion-row">
          <span class="grafik-companion-lbl">HJEM</span>
          <span class="grafik-companion-url" title="${hjemUrl}">${hjemUrl}</span>
          <button class="copy-btn icon-btn" data-copy="${hjemUrl}">⎘</button>
        </div>
        <div class="grafik-companion-row">
          <span class="grafik-companion-lbl">UDE</span>
          <span class="grafik-companion-url" title="${udeUrl}">${udeUrl}</span>
          <button class="copy-btn icon-btn" data-copy="${udeUrl}">⎘</button>
        </div>`;
      }).join('');
      companionRows = kampRows + `
      <div style="font-size:10px;color:#666;margin-top:6px;padding-top:6px;border-top:1px solid #222">Sluk Overlay 3</div>
      <div class="grafik-companion-row">
        <span class="grafik-companion-lbl">AF</span>
        <span class="grafik-companion-url" title="${afUrl}">${afUrl}</span>
        <button class="copy-btn icon-btn" data-copy="${afUrl}">⎘</button>
      </div>`;
    }
  } else if (!isAfvikling && g && g.type === 'ticker') {
    const tPaUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=${g.triggerKey}&value=in`;
    const tAfUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=${g.triggerKey}&value=out`;
    const bPaUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=breaking_trigger&value=in`;
    const bAfUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=breaking_trigger&value=out`;
    const sPaUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=score_trigger&value=in`;
    const sAfUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=score_trigger&value=out`;
    const lPaUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=live_boks_trigger&value=in`;
    const lAfUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=live_boks_trigger&value=out`;
    companionRows = `
      <div class="grafik-companion-row"><span class="grafik-companion-lbl" style="color:#aa66ff">T PÅ</span><span class="grafik-companion-url" title="${tPaUrl}">${tPaUrl}</span><button class="copy-btn icon-btn" data-copy="${tPaUrl}">⎘</button></div>
      <div class="grafik-companion-row"><span class="grafik-companion-lbl" style="color:#aa66ff">T AF</span><span class="grafik-companion-url" title="${tAfUrl}">${tAfUrl}</span><button class="copy-btn icon-btn" data-copy="${tAfUrl}">⎘</button></div>
      <div class="grafik-companion-row"><span class="grafik-companion-lbl" style="color:#ff4444">B PÅ</span><span class="grafik-companion-url" title="${bPaUrl}">${bPaUrl}</span><button class="copy-btn icon-btn" data-copy="${bPaUrl}">⎘</button></div>
      <div class="grafik-companion-row"><span class="grafik-companion-lbl" style="color:#ff4444">B AF</span><span class="grafik-companion-url" title="${bAfUrl}">${bAfUrl}</span><button class="copy-btn icon-btn" data-copy="${bAfUrl}">⎘</button></div>
      <div class="grafik-companion-row"><span class="grafik-companion-lbl" style="color:#44cc88">S PÅ</span><span class="grafik-companion-url" title="${sPaUrl}">${sPaUrl}</span><button class="copy-btn icon-btn" data-copy="${sPaUrl}">⎘</button></div>
      <div class="grafik-companion-row"><span class="grafik-companion-lbl" style="color:#44cc88">S AF</span><span class="grafik-companion-url" title="${sAfUrl}">${sAfUrl}</span><button class="copy-btn icon-btn" data-copy="${sAfUrl}">⎘</button></div>
      <div class="grafik-companion-row"><span class="grafik-companion-lbl" style="color:#ff2244">L PÅ</span><span class="grafik-companion-url" title="${lPaUrl}">${lPaUrl}</span><button class="copy-btn icon-btn" data-copy="${lPaUrl}">⎘</button></div>
      <div class="grafik-companion-row"><span class="grafik-companion-lbl" style="color:#ff2244">L AF</span><span class="grafik-companion-url" title="${lAfUrl}">${lAfUrl}</span><button class="copy-btn icon-btn" data-copy="${lAfUrl}">⎘</button></div>`;
  } else if (!isAfvikling && g && g.type === 'komm') {
    const paUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=komm_alle&value=in`;
    const afUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=komm_alle&value=out`;
    companionRows = `
      <div class="grafik-companion-row">
        <span class="grafik-companion-lbl">ALLE PÅ</span>
        <span class="grafik-companion-url" title="${paUrl}">${paUrl}</span>
        <button class="copy-btn icon-btn" data-copy="${paUrl}">⎘</button>
      </div>
      <div class="grafik-companion-row">
        <span class="grafik-companion-lbl">ALLE AF</span>
        <span class="grafik-companion-url" title="${afUrl}">${afUrl}</span>
        <button class="copy-btn icon-btn" data-copy="${afUrl}">⎘</button>
      </div>`;
  } else if (!isAfvikling && g) {
    const paUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=${g.triggerKey}&value=in`;
    const afUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=${g.triggerKey}&value=out`;
    companionRows = `
      <div class="grafik-companion-row">
        <span class="grafik-companion-lbl">PÅ</span>
        <span class="grafik-companion-url" title="${paUrl}">${paUrl}</span>
        <button class="copy-btn icon-btn" data-copy="${paUrl}">⎘</button>
      </div>
      <div class="grafik-companion-row">
        <span class="grafik-companion-lbl">AF</span>
        <span class="grafik-companion-url" title="${afUrl}">${afUrl}</span>
        <button class="copy-btn icon-btn" data-copy="${afUrl}">⎘</button>
      </div>`;
  } else if (customEmbedActive) {
    const paUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=${encodeURIComponent(customEmbedActive.trigger_key)}&value=in`;
    const afUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=${encodeURIComponent(customEmbedActive.trigger_key)}&value=out`;
    companionRows = `
      <div class="grafik-companion-row">
        <span class="grafik-companion-lbl">PÅ</span>
        <span class="grafik-companion-url" title="${paUrl}">${paUrl}</span>
        <button class="copy-btn icon-btn" data-copy="${paUrl}">⎘</button>
      </div>
      <div class="grafik-companion-row">
        <span class="grafik-companion-lbl">AF</span>
        <span class="grafik-companion-url" title="${afUrl}">${afUrl}</span>
        <button class="copy-btn icon-btn" data-copy="${afUrl}">⎘</button>
      </div>`;
  }
  if (customGrafik.length) {
    const customCompanionRows = customGrafik.map(cg => {
      const paUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=${encodeURIComponent(cg.trigger_key)}&value=in`;
      const afUrl = `${origin}/api/trigger/${pid}?token=${_companionToken}&key=${encodeURIComponent(cg.trigger_key)}&value=out`;
      return `
      <div class="grafik-companion-row">
        <span class="grafik-companion-lbl" style="color:${cg.color || '#888'}">${esc(cg.label.toUpperCase())}</span>
        <span class="grafik-companion-url" style="color:#888;font-size:9px;">PÅ / AF</span>
      </div>
      <div class="grafik-companion-row">
        <span class="grafik-companion-lbl">PÅ</span>
        <span class="grafik-companion-url" title="${paUrl}">${paUrl}</span>
        <button class="copy-btn icon-btn" data-copy="${paUrl}">⎘</button>
      </div>
      <div class="grafik-companion-row">
        <span class="grafik-companion-lbl">AF</span>
        <span class="grafik-companion-url" title="${afUrl}">${afUrl}</span>
        <button class="copy-btn icon-btn" data-copy="${afUrl}">⎘</button>
      </div>`;
    }).join('');
    companionRows += `<div class="grafik-companion-subhead" style="margin-top:${companionRows ? '10px' : '0'}">EGNE GRAFIK</div>${customCompanionRows}`;
  }
  if (makroer.length) {
    const makroCompanionRows = makroer.map(m => {
      const hasLt = (m.handlinger || []).some(h => h.key === 'lt_trigger');
      const url = hasLt
        ? `${origin}/api/trigger/${pid}?token=${_companionToken}&macro=${m.id}&slot=`
        : `${origin}/api/trigger/${pid}?token=${_companionToken}&macro=${m.id}`;
      return `<div class="grafik-companion-row">
        <span class="grafik-companion-lbl" style="color:${m.farve || '#4a9eff'}">${esc(m.label.toUpperCase())}</span>
        <span class="grafik-companion-url" title="${url}">${url}</span>
        <button class="copy-btn icon-btn" data-copy="${url}">⎘</button>
      </div>`;
    }).join('');
    companionRows += `<div class="grafik-companion-subhead" style="margin-top:${companionRows ? '10px' : '0'}">MAKROER</div>${makroCompanionRows}`;
  }

  const companionHTML = `
    <details class="grafik-lag-details"${grafiktCompanionOpen ? ' open' : ''} id="grafik-companion-details">
      <summary class="grafik-lag-summary">▸ COMPANION (HTTP POST)</summary>
      <div class="grafik-companion-section" style="border:none;padding:0;margin-top:8px;">
        ${companionRows}
      </div>
    </details>`;

  // ── HØJRE PANEL: LAG-RÆKKEFØLGE ─────────────────────────────────
  const TICKER_SUB_META = {
    'live-boks':       { label: 'Live Boks',              color: '#ff2244' },
    'breaking':        { label: 'Breaking Ticker',        color: '#ff4444' },
    'ticker-breaking': { label: 'Breaking Ticker Tekst',  color: '#ff4444' },
    'score-breaking':  { label: 'Breaking Stillings Boks',color: '#ff4444' },
    'ticker':          { label: 'Ticker',                 color: '#aa66ff' },
    'score':           { label: 'Stillings Boks',         color: '#44cc88' },
  };
  const tickerSubCount = tickerLagOrder.length;
  const tickerSubRows = tickerSubExpanded ? tickerLagOrder.map(subId => {
    const cg = subId.startsWith('custom-')
      ? customGrafik.find(g => 'custom-' + g.id.slice(0, 8) === subId) : null;
    const m = cg
      ? { label: cg.label.toUpperCase(), color: cg.color || '#888888' }
      : (TICKER_SUB_META[subId] || { label: subId, color: '#888' });
    return `<div class="lag-subrow" draggable="true" data-sublagid="${subId}">
      <span class="lag-handle">⠿</span>
      <span class="lag-label" style="color:${m.color}">${m.label}</span>
      ${cg ? `<button class="lag-ticker-out-btn" data-customid="${subId}" style="margin-left:auto;font-size:9px;padding:1px 6px;background:none;border:1px solid #555;color:#aaa;border-radius:3px;cursor:pointer;">◂ Ud</button>` : ''}
    </div>`;
  }).join('') : '';
  const lagRows = overlayLagOrder.map(id => {
    const og = OVERLAY_GRAPHICS.find(x => x.id === id);
    if (og) {
      if (!og.file) return '';
      if (id === 'ticker') {
        return `<div class="lag-row" draggable="true" data-lagid="${id}">
          <span class="lag-handle">⠿</span>
          <span class="lag-label">${og.label}</span>
          <button class="lag-sub-toggle${tickerSubExpanded ? ' open' : ''}" id="tickerSubToggle">${tickerSubExpanded ? '▾' : '▸'} ${tickerSubCount} lag</button>
        </div>
        ${tickerSubExpanded ? `<div class="lag-sublist" id="tickerSubLagList">${tickerSubRows}</div>` : ''}`;
      }
      return `<div class="lag-row" draggable="true" data-lagid="${id}">
        <span class="lag-handle">⠿</span>
        <span class="lag-label">${og.label}</span>
      </div>`;
    }
    const cg = id.startsWith('custom-')
      ? customGrafik.find(g => 'custom-' + g.id.slice(0, 8) === id)
      : null;
    if (!cg) return '';
    return `<div class="lag-row" draggable="true" data-lagid="${id}">
      <span class="lag-handle">⠿</span>
      <span class="lag-label" style="color:${cg.color || '#888888'}">${esc(cg.label.toUpperCase())}</span>
      <button class="lag-ticker-in-btn" data-customid="${id}" style="margin-left:auto;font-size:9px;padding:1px 6px;background:none;border:1px solid #555;color:#aaa;border-radius:3px;cursor:pointer;">Ticker ▸</button>
    </div>`;
  }).filter(Boolean).join('');
  const lagHTML = `
    <details class="grafik-lag-details">
      <summary class="grafik-lag-summary">▸ LAG-RÆKKEFØLGE</summary>
      <div style="font-size:11px;color:#444;margin:8px 0 10px;">Øverst = forrest i vMix overlay. Træk for at omsortere.</div>
      <div id="overlayLagList" class="lag-list">${lagRows}</div>
    </details>`;

  // ── RENDER ───────────────────────────────────────────────────────
  const existingWrap = container.querySelector('.grafik-v2-wrap');
  if (!existingWrap) {
    // Første render: byg hele shell inkl. iframes
    container.innerHTML = `
      <div class="grafik-v2-wrap">
        <div class="grafik-v2-left">
          <div class="grafik-v2-subtabs">${subTabsHTML}<button class="grafik-alle-af-btn" id="grafik-alle-af">■ ALLE AF</button></div>
          <div class="grafik-v2-content">${contentHTML}</div>
        </div>
        <div class="grafik-v2-right">
          ${previewHTML}
          ${companionHTML}
          ${lagHTML}
        </div>
      </div>`;
  } else {
    // Efterfølgende render: opdater kun venstre panel og companion — bevar iframes
    existingWrap.querySelector('.grafik-v2-subtabs').innerHTML =
      subTabsHTML + `<button class="grafik-alle-af-btn" id="grafik-alle-af">■ ALLE AF</button>`;
    existingWrap.querySelector('.grafik-v2-content').innerHTML = contentHTML;
    const companionEl = existingWrap.querySelector('#grafik-companion-details');
    if (companionEl) {
      companionEl.innerHTML = `
        <summary class="grafik-lag-summary">▸ COMPANION (HTTP POST)</summary>
        <div class="grafik-companion-section" style="border:none;padding:0;margin-top:8px;">${companionRows}</div>`;
      if (grafiktCompanionOpen) companionEl.open = true;
    }
    const lagListEl = existingWrap.querySelector('#overlayLagList');
    if (lagListEl) {
      lagListEl.innerHTML = lagRows;
      delete lagListEl.dataset.dndInit;
    }
  }

  // ── EVENT LISTENERS ──────────────────────────────────────────────
  container.querySelectorAll('.grafik-v2-tab').forEach(btn =>
    btn.addEventListener('click', () => {
      grafiktActiveSubTab = btn.dataset.gtab;
      renderGrafik(); // grafiktActivePrvKey/-Url bevares — iframes reloades ikke
    }));

  const alleAfBtn = container.querySelector('#grafik-alle-af');
  if (alleAfBtn) alleAfBtn.addEventListener('click', async () => {
    const allKeys = [...OVERLAY_GRAPHICS.map(og => og.triggerKey).filter(Boolean), 'score_breaking_trigger'];
    const customKeys = customGrafik.map(g => g.trigger_key);
    OVERLAY_GRAPHICS.forEach(og => { if (og.triggerKey) grafiktState[og.triggerKey] = 'out'; });
    grafiktState['score_breaking_trigger'] = 'out';
    customKeys.forEach(k => { grafiktState[k] = 'out'; });
    grafiktState['lt_slot'] = '';
    renderGrafik();
    try {
      await Promise.all([
        ...allKeys.map(key => sbUpsert('settings', { projekt_id: aktivProjektId, key, value: 'out' })),
        ...customKeys.map(key => sbUpsert('settings', { projekt_id: aktivProjektId, key, value: 'out' })),
        sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_slot', value: '' }),
      ]);
    } catch { toast('Fejl ved ALLE AF', 'err'); }
  });

  container.querySelectorAll('[data-prv-type]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.prvType;
      try {
        if (type === 'lt') {
          await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_slot_prv',    value: btn.dataset.prvSlot });
          await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_trigger_prv', value: 'in' });
        } else if (type === 'vmixcall') {
          // vmixcall bruger lower-third med vmixcall-trigger til preview
          await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_slot_prv',    value: btn.dataset.prvSlot });
          await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_trigger_prv', value: 'vmixcall' });
        } else if (type === 'lineup') {
          // Gem slot-data til lineup_data så preview-iframe henter korrekt opstilling
          const slot = btn.dataset.prvSlot;
          const side = btn.dataset.prvSide;
          const slotData = lineupSlots[slot]?.[side];
          if (slotData) {
            await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lineup_data', value: JSON.stringify(slotData) });
          }
        } else {
          await sbUpsert('settings', { projekt_id: aktivProjektId, key: btn.dataset.prvKey + '_prv', value: 'in' });
        }
        grafiktActivePrvKey = btn.dataset.prvId;
        grafiktActivePrvUrl = btn.dataset.prvUrl || previewIframeUrl;
        container.querySelectorAll('[data-prv-type]').forEach(b =>
          b.classList.toggle('active', b.dataset.prvId === grafiktActivePrvKey));
        const prvIframe = container.querySelector('.grafik-preview-iframe');
        if (prvIframe) prvIframe.src = grafiktActivePrvUrl;
      } catch { toast('Fejl ved PRW', 'err'); }
    });
  });

  const prwOutBtn = container.querySelector('#grafik-prw-out-btn');
  if (prwOutBtn) prwOutBtn.addEventListener('click', async () => {
    try {
      if (grafiktActivePrvKey.startsWith('custom-')) {
        const cId = grafiktActivePrvKey.slice(7);
        const cg  = customGrafik.find(x => x.id === cId);
        if (cg) await sbUpsert('settings', { projekt_id: aktivProjektId, key: cg.trigger_key + '_prv', value: 'out' });
      } else if (g && g.type === 'lt') {
        await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_trigger_prv', value: 'out' });
      } else if (g && g.type !== 'vmixcalls') {
        await sbUpsert('settings', { projekt_id: aktivProjektId, key: g.triggerKey + '_prv', value: 'out' });
      }
    } catch { toast('Fejl ved PRW UD', 'err'); }
    grafiktActivePrvKey = '';
    grafiktActivePrvUrl = '';
    const prvIframe = container.querySelector('.grafik-preview-iframe');
    if (prvIframe) { prvIframe.removeAttribute('srcdoc'); prvIframe.src = 'about:blank'; }
    renderGrafik();
  });

  container.querySelectorAll('.grafik-vmix-call-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      const idx  = +btn.dataset.idx;
      const slot = idx + 1;
      const c    = vmixCalls[idx];
      grafiktState['lt_slot']    = String(slot);
      grafiktState['lt_trigger'] = 'vmixcall';
      renderGrafik();
      try {
        await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_slot',    value: String(slot) });
        await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_trigger', value: 'vmixcall', slot: String(slot) });
      } catch { toast('Fejl ved vmixcall trigger', 'err'); }
      if (c?.link) fetch(c.link, { mode: 'no-cors' }).catch(() => {});
    }));

  container.querySelectorAll('.grafik-vmix-out-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      grafiktState['lt_slot']    = '';
      grafiktState['lt_trigger'] = 'out';
      renderGrafik();
      try {
        await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_trigger', value: 'out' });
      } catch { toast('Fejl ved vmixcall AF', 'err'); }
    }));

  container.querySelectorAll('[data-copy]').forEach(btn =>
    btn.addEventListener('click', () => copyText(btn.dataset.copy)));

  container.querySelectorAll('[data-trig]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      setGrafiktTrigger(btn.dataset.trig, btn.dataset.val);
    }));

  container.querySelectorAll('.komm-alle-paa-btn').forEach(btn => {
    if (btn.dataset.bound) return; btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      _kommPaaMode = true;
      const targets = KOMM_BOKSE.filter(k => kampe[k.slot - 1]?.onAir === true);
      targets.forEach(k => { grafiktState[k.triggerKey] = 'in'; });
      renderGrafik();
      // Gem master-tilstanden så "grafik på" overlever reload og holder når kampe kommer/går
      await Promise.all([
        sbUpsert('settings', { projekt_id: aktivProjektId, key: 'komm_master', value: 'on' }),
        ...targets.map(k => sbUpsert('settings', { projekt_id: aktivProjektId, key: k.triggerKey, value: 'in' }))
      ]).catch(() => toast('Fejl ved Komm PÅ', 'err'));
    });
  });
  container.querySelectorAll('.komm-alle-af-btn').forEach(btn => {
    if (btn.dataset.bound) return; btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      _kommPaaMode = false;
      KOMM_BOKSE.forEach(k => { grafiktState[k.triggerKey] = 'out'; });
      renderGrafik();
      await Promise.all([
        sbUpsert('settings', { projekt_id: aktivProjektId, key: 'komm_master', value: 'off' }),
        ...KOMM_BOKSE.map(k => sbUpsert('settings', { projekt_id: aktivProjektId, key: k.triggerKey, value: 'out' }))
      ]).catch(() => toast('Fejl ved Komm AF', 'err'));
    });
  });

  container.querySelectorAll('.grafik-lu-btn').forEach(btn =>
    btn.addEventListener('click', () => sendLineupSide(btn.dataset.matchid, btn.dataset.side)));

  container.querySelectorAll('.grafik-lu-off-btn').forEach(btn =>
    btn.addEventListener('click', () => { if (!btn.disabled) sendLineupOff(); }));

  container.querySelectorAll('.grafik-lt-paa').forEach(btn =>
    btn.addEventListener('click', async () => {
      const slot        = btn.dataset.slot;
      const currentSlot = grafiktState['lt_slot'] || '';
      const currentVal  = grafiktState['lt_trigger'] || 'out';
      const isAlreadyOn = currentVal !== 'out' && currentSlot !== '';
      // Skift kun tekst (update) hvis en sub allerede er on air — ellers fuld IN
      const triggerVal  = isAlreadyOn ? 'update' : 'in';
      grafiktState['lt_slot']    = slot;
      grafiktState['lt_trigger'] = triggerVal;
      renderGrafik();
      try {
        await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_slot',    value: slot });
        await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lt_trigger', value: triggerVal, slot });
      } catch { toast('Fejl ved lower third trigger', 'err'); }
    }));

  container.querySelectorAll('.makro-sub-fire-btn').forEach(btn =>
    btn.addEventListener('click', () => fireMakro(btn.dataset.makroId)));

  container.querySelectorAll('.makro-sub-add-btn').forEach(btn =>
    btn.addEventListener('click', () => openMakroModal(null,
      [{ key: 'lt_trigger', value: 'in', slot: btn.dataset.slot }])));

  const companionDetails = container.querySelector('#grafik-companion-details');
  if (companionDetails) {
    companionDetails.addEventListener('toggle', () => { grafiktCompanionOpen = companionDetails.open; });
  }

  initLagDragDrop();
  initTickerSubLagDragDrop();

  const tickerSubToggle = container.querySelector('#tickerSubToggle');
  if (tickerSubToggle) {
    tickerSubToggle.addEventListener('click', e => {
      e.stopPropagation(); // undgå at trække ticker-rækken
      tickerSubExpanded = !tickerSubExpanded;
      renderGrafik();
    });
  }

  // EGNE GRAFIK + MAKROER (alle faner)
  const leftPanel = container.querySelector('.grafik-v2-left');
  if (leftPanel) renderEgneGrafik(leftPanel);
  if (leftPanel) renderMakroer(leftPanel);

  // ── AFVIKLING DnD ────────────────────────────────────────────────
  if (isAfvikling) {
    container.querySelectorAll('.afv-fire-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        const row = btn.closest('.afv-makro-row');
        const slotSel = row?.querySelector('.afv-slot-sel');
        fireMakro(btn.dataset.id, slotSel?.value || '');
      }));
    container.querySelectorAll('.afv-edit-btn').forEach(btn =>
      btn.addEventListener('click', () => openMakroModal(btn.dataset.id)));

    const afvList = container.querySelector('#afv-makro-list');
    if (afvList && !afvList.dataset.dndInit) {
      afvList.dataset.dndInit = '1';
      let dragSrc = null;
      let dropped = false;
      afvList.addEventListener('dragstart', e => {
        dragSrc = e.target.closest('.afv-makro-row');
        if (!dragSrc) return;
        dropped = false;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => dragSrc.classList.add('dragging'), 0);
      });
      function _afvClearIndicators() {
        afvList.querySelectorAll('.drag-over-top,.drag-over-bottom').forEach(r => {
          r.classList.remove('drag-over-top', 'drag-over-bottom');
        });
      }
      afvList.addEventListener('dragover', e => {
        e.preventDefault();
        const row = e.target.closest('.afv-makro-row');
        _afvClearIndicators();
        if (row && row !== dragSrc) {
          const rect = row.getBoundingClientRect();
          row.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
        }
      });
      afvList.addEventListener('dragleave', e => {
        if (!afvList.contains(e.relatedTarget)) _afvClearIndicators();
      });
      afvList.addEventListener('drop', e => {
        e.preventDefault();
        const target = e.target.closest('.afv-makro-row');
        _afvClearIndicators();
        if (!target || !dragSrc || target === dragSrc) return;
        const rect = target.getBoundingClientRect();
        afvList.insertBefore(dragSrc, e.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
        dropped = true;
      });
      afvList.addEventListener('dragend', async () => {
        dragSrc?.classList.remove('dragging');
        _afvClearIndicators();
        dragSrc = null;
        if (!dropped) return;
        dropped = false;
        const rows = [...afvList.querySelectorAll('.afv-makro-row')];
        try {
          await Promise.all(rows.map((row, idx) =>
            sbPatch('projekt_makroer?id=eq.' + row.dataset.makroId, { sort_order: idx })
          ));
          await loadMakroer();
        } catch { toast('Fejl ved gem af rækkefølge', 'err'); }
      });
    }
  }
}

function renderEgneGrafik(leftPanel) {
  let wrap = leftPanel.querySelector('.egne-grafik-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'egne-grafik-wrap';
    leftPanel.appendChild(wrap);
  }

  let html = `
    <details class="grafik-collapse"${egneGrafikOpen ? ' open' : ''} style="margin-top:12px;display:block;">
      <summary class="grafik-section-head" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;list-style:none;-webkit-appearance:none;">▸ EGNE GRAFIK</summary>
      <button class="grafik-btn-prw" style="padding:3px 8px;font-size:10px;border-radius:4px;float:right;margin-top:-22px;position:relative;z-index:1;"
        onclick="openEgneGrafikModal()">＋ Tilføj</button>`;

  if (!customGrafik.length) {
    html += `<div class="grafik-v2-empty">Ingen egne grafik — klik ＋ Tilføj for at uploade en fil</div>`;
  } else {
    customGrafik.forEach(g => {
      const isLive = (grafiktState[g.trigger_key] || 'out') !== 'out';
      const prvActive = grafiktActivePrvKey === 'custom-' + g.id;
      html += `
      <div class="grafik-block" style="--g-color:${g.color || '#888888'}">
        <div class="grafik-block-info">
          <span class="grafik-block-name">${esc(g.label.toUpperCase())}</span>
          <span class="grafik-block-sub"${isLive ? ` style="color:var(--g-color)"` : ''}>${isLive ? '● LIVE' : esc(g.trigger_key)}</span>
        </div>
        <div class="grafik-block-actions">
          <button class="grafik-btn-prw${prvActive ? ' active' : ''}"
            data-prv-type="custom"
            data-prv-key="${esc(g.trigger_key)}"
            data-prv-id="custom-${g.id}"
            data-custom-file-url="${esc(g.file_url)}">PRW</button>
          <button class="grafik-btn-out" data-trig="${esc(g.trigger_key)}" data-val="out"${!isLive ? ' disabled' : ''}>&lt; OUT</button>
          <button class="grafik-btn-in${isLive ? ' on' : ''}" data-trig="${esc(g.trigger_key)}" data-val="in">&gt; IN</button>
          <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:4px 6px;"
            title="Slet" onclick="deleteEgneGrafik(this)"
            data-custom-id="${g.id}"
            data-custom-path="${esc(g.file_path)}">🗑</button>
        </div>
      </div>`;
    });
  }

  html += `</details>`;
  wrap.innerHTML = html;
  wrap.querySelector('details')?.addEventListener('toggle', e => { egneGrafikOpen = e.target.open; });

  // IN/OUT knapper
  wrap.querySelectorAll('[data-trig]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      setGrafiktTrigger(btn.dataset.trig, btn.dataset.val);
    }));

  // Custom PRW knapper
  wrap.querySelectorAll('[data-prv-type="custom"]').forEach(btn =>
    btn.addEventListener('click', async () => {
      try {
        await sbUpsert('settings', { projekt_id: aktivProjektId, key: btn.dataset.prvKey + '_prv', value: 'in' });
        const fileUrl = btn.dataset.customFileUrl;
        const htmlContent = await fetch(fileUrl).then(r => r.text());
        const inject = `<script>window.__PROJEKT_ID=${JSON.stringify(aktivProjektId)};window.__IS_PREVIEW=true;<\/script>`;
        const content = htmlContent.replace(/(<html[^>]*>)/i, '$1' + inject);
        grafiktActivePrvKey = btn.dataset.prvId;
        grafiktActivePrvUrl = '';
        document.querySelectorAll('[data-prv-type]').forEach(b =>
          b.classList.toggle('active', b.dataset.prvId === grafiktActivePrvKey));
        const prvIframe = document.querySelector('.grafik-preview-iframe');
        if (prvIframe) {
          const blob = new Blob([content], { type: 'text/html' });
          prvIframe.src = URL.createObjectURL(blob);
        }
      } catch { toast('Fejl ved PRW', 'err'); }
    }));
}

function _makroKeyOptions(selectedKey) {
  const builtIn = [
    { key: 'ticker_ovl_trigger',  label: 'Ticker' },
    { key: 'breaking_trigger',       label: 'Breaking Ticker' },
    { key: 'score_breaking_trigger', label: 'Breaking Stillings Boks' },
    { key: 'score_trigger',          label: 'Stillings Boks' },
    { key: 'live_boks_trigger',   label: 'Live Boks' },
    { key: 'lt_trigger',          label: 'SUB' },
    { key: 'lineup_trigger',      label: 'Opstilling' },
    { key: 'credits_trigger',     label: 'Credits' },
    { key: 'komm_alle',           label: 'Komm Boks ALLE' },
    { key: 'wait',                label: '⏱ Pause/vent' },
    { key: 'alle_af',             label: '■ ALLE AF' },
  ];
  const all = [
    ...builtIn,
    ...customGrafik.map(g => ({ key: g.trigger_key, label: g.label }))
  ];
  return all.map(o =>
    `<option value="${esc(o.key)}"${o.key === selectedKey ? ' selected' : ''}>${esc(o.label)}</option>`
  ).join('');
}

function renderMakroer(leftPanel) {
  let wrap = leftPanel.querySelector('.makroer-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'makroer-wrap';
    leftPanel.appendChild(wrap);
  }

  let html = `
    <details class="grafik-collapse"${makroerPanelOpen ? ' open' : ''} style="margin-top:8px;display:block;">
      <summary class="grafik-section-head" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;list-style:none;-webkit-appearance:none;">▸ MAKROER</summary>
      <button class="grafik-btn-prw" style="padding:3px 8px;font-size:10px;border-radius:4px;float:right;margin-top:-22px;position:relative;z-index:1;"
        onclick="openMakroModal()">＋ Tilføj</button>`;

  if (!makroer.length) {
    html += `<div class="grafik-v2-empty">Ingen makroer — klik ＋ Tilføj for at oprette en</div>`;
  } else {
    makroer.forEach(m => {
      const _grps = [], _cur = [];
      for (const h of m.handlinger || []) {
        if (h.key === 'wait' || h.key === 'alle_af') {
          if (_cur.length) { _grps.push({ type: 'batch', steps: [..._cur] }); _cur.length = 0; }
          _grps.push({ type: 'single', step: h });
        } else { _cur.push(h); }
      }
      if (_cur.length) _grps.push({ type: 'batch', steps: _cur });
      const summary = _grps.map(g => {
        if (g.type === 'single') {
          const h = g.step;
          if (h.key === 'wait') return `⏱ ${h.value}s`;
          if (h.key === 'alle_af') return '■ ALLE AF';
          if (h.key === 'lineup_trigger') {
            const side = h.value === 'home' ? 'Hjemme' : h.value === 'away' ? 'Ude' : 'AF';
            return h.value === 'out' ? 'Opstilling: AF' : `Opstilling K${h.slot || '?'}: ${side}`;
          }
          return `${_makroKeyLabel(h.key)}: ${h.value === 'in' ? 'PÅ' : 'AF'}`;
        }
        const labels = g.steps.map(h => {
          if (h.key === 'lt_trigger' && h.slot) {
            const s = subs[parseInt(h.slot) - 1];
            const navn = s?.navn ? ': ' + s.navn : ' ' + h.slot;
            return `Sub${navn}: ${h.value === 'in' ? 'PÅ' : 'AF'}`;
          }
          if (h.key === 'lineup_trigger') {
            const side = h.value === 'home' ? 'Hjemme' : h.value === 'away' ? 'Ude' : 'AF';
            return h.value === 'out' ? 'Opstilling: AF' : `Opstilling K${h.slot || '?'}: ${side}`;
          }
          return `${_makroKeyLabel(h.key)}: ${h.value === 'in' ? 'PÅ' : 'AF'}`;
        });
        return g.steps.length > 1 ? `[${labels.join(' + ')}]` : labels[0];
      }).join(' · ');
      html += `
      <div class="grafik-block" style="--g-color:${m.farve || '#4a9eff'}">
        <div class="grafik-block-info">
          <span class="grafik-block-name">${esc(m.label.toUpperCase())}</span>
          ${summary ? `<span class="grafik-block-sub" style="color:#666">${esc(summary)}</span>` : ''}
        </div>
        <div class="grafik-block-actions">
          <button class="grafik-btn-prw" title="Redigér"
            onclick="openMakroModal('${m.id}')">✎</button>
          <button class="grafik-btn-prw" title="Slet" style="color:#c44"
            onclick="deleteMakro('${m.id}')">✕</button>
          <button class="grafik-btn-in" style="background:${m.farve || '#4a9eff'}22;border-color:${m.farve || '#4a9eff'}66;color:${m.farve || '#4a9eff'}"
            onclick="fireMakro('${m.id}')">▶ KØR</button>
        </div>
      </div>`;
    });
  }

  html += `</details>`;
  wrap.innerHTML = html;
  wrap.querySelector('details')?.addEventListener('toggle', e => { makroerPanelOpen = e.target.open; });
}

function _makroKeyLabel(key) {
  const map = {
    ticker_ovl_trigger: 'Ticker',
    breaking_trigger:   'Breaking',
    score_trigger:      'Stillings',
    live_boks_trigger:  'Live Boks',
    lt_trigger:         'SUB',
    lineup_trigger:     'Opstilling',
    credits_trigger:    'Credits',
    komm_alle:          'Komm Boks',
  };
  if (map[key]) return map[key];
  const cg = customGrafik.find(g => g.trigger_key === key);
  return cg ? cg.label : key;
}

function openMakroModal(id, prefillHandlinger) {
  const modal = document.getElementById('makro-modal');
  if (!modal) return;
  const m = id ? makroer.find(x => x.id === id) : null;
  document.getElementById('makro-modal-id').value = id || '';
  document.getElementById('makro-label-inp').value = m ? m.label : '';
  document.getElementById('makro-color-inp').value = m ? (m.farve || '#4a9eff') : '#4a9eff';
  const list = document.getElementById('makro-handlinger-list');
  list.innerHTML = '';
  const src = m?.handlinger?.length ? m.handlinger
            : prefillHandlinger?.length ? prefillHandlinger
            : [{ key: 'ticker_ovl_trigger', value: 'in' }];
  src.forEach(h => _addMakroHandlingRow(h.key, h.value, h.slot || ''));
  _updateMakroGrouping();
  const listEl = document.getElementById('makro-handlinger-list');
  if (listEl) delete listEl.dataset.dndInit;
  _initMakroHandlingDragDrop();
  modal.style.display = 'flex';
}

function _closeMakroModal() {
  const modal = document.getElementById('makro-modal');
  if (modal) modal.style.display = 'none';
}

function _addMakroHandling() {
  _addMakroHandlingRow('ticker_ovl_trigger', 'in');
  _updateMakroGrouping();
}

function _buildLineupKampOpts(selectedSlot) {
  const opts = kampe.map((k, i) => {
    if (!k.enetpulseId) return '';
    const slot = i + 1;
    const label = 'Kamp ' + slot + (k.hold1Kort && k.hold2Kort ? ': ' + esc(k.hold1Kort) + ' vs ' + esc(k.hold2Kort) : '');
    return `<option value="${slot}"${String(selectedSlot) === String(slot) ? ' selected' : ''}>${label}</option>`;
  }).filter(Boolean);
  if (!opts.length) return `<option value="">Ingen kampe med Enetpulse</option>`;
  return opts.join('');
}

function _buildLtSlotOpts(encodedSlot) {
  // encodedSlot: '1'-'15' for subs, 'v1'-'v8' for vmixcalls, '' for none
  const subOpts = subs.map((s, i) => {
    const n = i + 1;
    if (!s.navn && !s.titel) return '';
    return `<option value="${n}"${encodedSlot === String(n) ? ' selected' : ''}>Sub ${n}${s.navn ? ': ' + esc(s.navn) : ''}</option>`;
  }).filter(Boolean);
  const vmixOpts = vmixCalls.map((v, i) => {
    const n = i + 1;
    if (!v.navn && !v.titel) return '';
    return `<option value="v${n}"${encodedSlot === `v${n}` ? ' selected' : ''}>VMIX ${n}${v.navn ? ': ' + esc(v.navn) : ''}</option>`;
  }).filter(Boolean);
  return [
    `<option value="">→ Vælg ved afvikling</option>`,
    ...subOpts,
    ...(vmixOpts.length ? [`<option disabled style="color:#444;font-size:10px;"> ── VMIX CALLS ──</option>`, ...vmixOpts] : [])
  ].join('');
}

function _addMakroHandlingRow(key, value, slot, afterRow) {
  const list = document.getElementById('makro-handlinger-list');
  if (!list) return;
  const isLt      = key === 'lt_trigger';
  const isLineup  = key === 'lineup_trigger';
  const isWait    = key === 'wait';
  const isAlleAf  = key === 'alle_af';
  const encodedSlot = (key === 'lt_trigger' && value === 'vmixcall') ? 'v' + slot : slot;
  const slotOpts = isLt ? _buildLtSlotOpts(encodedSlot) : isLineup ? _buildLineupKampOpts(slot) : '';
  const valOpts = isLineup
    ? `<option value="home"${value === 'home' ? ' selected' : ''}>Hjemme</option>
       <option value="away"${value === 'away' ? ' selected' : ''}>Ude</option>
       <option value="out"${value === 'out' ? ' selected' : ''}>AF</option>`
    : `<option value="in"${(value === 'in' || value === 'vmixcall') ? ' selected' : ''}>PÅ</option>
       <option value="out"${value === 'out' ? ' selected' : ''}>AF</option>`;
  const row = document.createElement('div');
  row.className = 'makro-handling-row';
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:#1a1a1a;border:1px solid #252525;border-radius:6px;padding:5px 8px;';
  row.innerHTML = `
    <span class="makro-drag-handle" draggable="true" style="color:#444;font-size:14px;user-select:none;flex-shrink:0;">⠿</span>
    <select class="makro-key-sel" style="flex:1;min-width:0;background:#111;border:1px solid #333;color:#ccc;padding:5px;border-radius:5px;font-size:11px;">
      ${_makroKeyOptions(key)}
    </select>
    <select class="makro-val-sel" style="width:68px;flex-shrink:0;background:#111;border:1px solid #333;color:#ccc;padding:5px;border-radius:5px;font-size:11px;display:${(isWait || isAlleAf) ? 'none' : 'block'};">
      ${valOpts}
    </select>
    <input class="makro-wait-inp" type="number" min="0.1" step="0.1" placeholder="sek"
      value="${isWait ? esc(value) : ''}"
      style="width:68px;flex-shrink:0;background:#111;border:1px solid #333;color:#ccc;padding:5px;border-radius:5px;font-size:11px;display:${isWait ? 'block' : 'none'};">
    <button class="makro-delete-btn"
      style="background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:2px 4px;flex-shrink:0;">✕</button>
    <button class="makro-combine-btn" title="Tilføj til gruppe (kører samtidigt)"
      style="background:none;border:none;color:#4a9eff88;cursor:pointer;font-size:16px;padding:2px 4px;flex-shrink:0;display:none;">⊕</button>
    <select class="makro-slot-sel" style="flex:1 0 calc(100% - 22px);min-width:0;background:#111;border:1px solid #333;color:#ccc;padding:5px;border-radius:5px;font-size:11px;display:${(isLt || isLineup) ? 'block' : 'none'};">
      ${slotOpts}
    </select>`;
  row.querySelector('.makro-key-sel').addEventListener('change', function() {
    const lt      = this.value === 'lt_trigger';
    const lineup  = this.value === 'lineup_trigger';
    const wait    = this.value === 'wait';
    const alleAf  = this.value === 'alle_af';
    const valSel  = row.querySelector('.makro-val-sel');
    const slotSel = row.querySelector('.makro-slot-sel');
    slotSel.style.display = (lt || lineup) ? 'block' : 'none';
    slotSel.style.flex    = (lt || lineup) ? '1 0 calc(100% - 22px)' : '';
    valSel.style.display  = (wait || alleAf) ? 'none' : 'block';
    row.querySelector('.makro-wait-inp').style.display = wait ? 'block' : 'none';
    if (lt)     slotSel.innerHTML = _buildLtSlotOpts('');
    if (lineup) slotSel.innerHTML = _buildLineupKampOpts('');
    if (lineup) {
      valSel.innerHTML = `<option value="home">Hjemme</option><option value="away">Ude</option><option value="out">AF</option>`;
    } else if (!wait && !alleAf) {
      valSel.innerHTML = `<option value="in">PÅ</option><option value="out">AF</option>`;
    }
    _updateMakroGrouping();
  });
  row.querySelector('.makro-delete-btn').addEventListener('click', function() {
    row.remove();
    _updateMakroGrouping();
  });
  row.querySelector('.makro-combine-btn').addEventListener('click', function() {
    _addMakroHandlingRow('ticker_ovl_trigger', 'in', '', row);
    _updateMakroGrouping();
  });
  if (afterRow) afterRow.after(row);
  else list.appendChild(row);
}

function _initMakroHandlingDragDrop() {
  const list = document.getElementById('makro-handlinger-list');
  if (!list || list.dataset.dndInit) return;
  list.dataset.dndInit = '1';
  let dragSrc = null;

  list.addEventListener('dragstart', e => {
    if (!e.target.classList.contains('makro-drag-handle')) return;
    dragSrc = e.target.closest('.makro-handling-row');
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => dragSrc?.classList.add('dragging'), 0);
  });
  list.addEventListener('dragend', () => {
    dragSrc?.classList.remove('dragging');
    list.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over'));
    dragSrc = null;
  });
  list.addEventListener('dragover', e => {
    e.preventDefault();
    const row = e.target.closest('.makro-handling-row');
    list.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over'));
    if (row && row !== dragSrc) row.classList.add('drag-over');
  });
  list.addEventListener('drop', e => {
    e.preventDefault();
    const target = e.target.closest('.makro-handling-row');
    if (!target || !dragSrc || target === dragSrc) return;
    target.classList.remove('drag-over');
    const rect = target.getBoundingClientRect();
    list.insertBefore(dragSrc, e.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
    _updateMakroGrouping();
  });
}

function _updateMakroGrouping() {
  const list = document.getElementById('makro-handlinger-list');
  if (!list) return;
  const rows = Array.from(list.querySelectorAll('.makro-handling-row'));
  const groups = [];
  let cur = [];
  rows.forEach(row => {
    const key = row.querySelector('.makro-key-sel')?.value;
    if (key === 'wait' || key === 'alle_af') {
      if (cur.length) { groups.push(cur); cur = []; }
      groups.push([row]);
    } else { cur.push(row); }
  });
  if (cur.length) groups.push(cur);
  groups.forEach(grp => {
    const key0 = grp[0]?.querySelector('.makro-key-sel')?.value;
    const isSep = key0 === 'wait' || key0 === 'alle_af';
    const isMulti = !isSep && grp.length > 1;
    grp.forEach(row => {
      const cb = row.querySelector('.makro-combine-btn');
      if (isSep) {
        row.style.borderLeft = '2px solid #333';
        row.style.opacity = '0.7';
        if (cb) cb.style.display = 'none';
      } else {
        row.style.borderLeft = isMulti ? '2px solid #4a9eff66' : '2px solid #252525';
        row.style.opacity = '1';
        if (cb) cb.style.display = isMulti ? 'inline' : 'none';
      }
    });
  });
}

// Grænse for server-kørte makroer (Companion via /api/trigger). Skal matche
// MAX_MACRO_WAIT_MS i api/trigger/[id].js. Panelets ▶ KØR er browser-kørt og
// har ingen timeout — derfor advarer vi kun, vi blokerer ikke gemning.
const MAKRO_MAX_WAIT_MS = 25000;

async function _confirmMakroModal() {
  const id    = document.getElementById('makro-modal-id').value;
  const label = document.getElementById('makro-label-inp').value.trim();
  const farve = document.getElementById('makro-color-inp').value;
  if (!label) { toast('Navn mangler', 'err'); return; }

  const handlinger = Array.from(document.querySelectorAll('#makro-handlinger-list .makro-handling-row')).map(row => {
    const key = row.querySelector('.makro-key-sel').value;
    if (key === 'wait') {
      const sek = parseFloat(row.querySelector('.makro-wait-inp').value) || 1;
      return { key: 'wait', value: String(sek) };
    }
    const valSel = row.querySelector('.makro-val-sel').value;
    const slotSel = row.querySelector('.makro-slot-sel');
    const rawSlot = (slotSel && slotSel.style.display !== 'none') ? slotSel.value : '';
    if (key === 'lt_trigger') {
      if (valSel === 'out') return { key: 'lt_trigger', value: 'out' };
      if (rawSlot.startsWith('v')) return { key: 'lt_trigger', value: 'vmixcall', slot: rawSlot.slice(1) };
      return { key: 'lt_trigger', value: 'in', slot: rawSlot };
    }
    if (key === 'lineup_trigger') {
      return { key: 'lineup_trigger', value: valSel, slot: rawSlot };
    }
    const h = { key, value: valSel };
    if (rawSlot) h.slot = rawSlot;
    return h;
  });

  const sort_order = id
    ? (makroer.find(x => x.id === id)?.sort_order ?? 0)
    : (makroer.length ? Math.max(...makroer.map(x => x.sort_order || 0)) + 1 : 0);

  const body = { projekt_id: aktivProjektId, label, farve, handlinger, sort_order };
  if (id) body.id = id;

  try {
    await sbUpsert('projekt_makroer', body);
    _closeMakroModal();
    await loadMakroer();
    renderGrafik();
    // Advar hvis makroens samlede ventetid gør den for lang til Companion. Den
    // virker stadig fint fra panelets ▶ KØR (browser-kørt, ingen timeout).
    const totalWaitMs = handlinger
      .filter(h => h.key === 'wait')
      .reduce((sum, h) => sum + Math.max(0, (parseFloat(h.value) || 0) * 1000), 0);
    if (totalWaitMs > MAKRO_MAX_WAIT_MS) {
      toast(`Makro gemt, men ${Math.round(totalWaitMs / 1000)}s ventetid er for langt til Companion (maks ${MAKRO_MAX_WAIT_MS / 1000}s) – kør den fra panelet`, 'err');
    } else {
      toast('Makro gemt', 'ok');
    }
  } catch { toast('Fejl ved gem af makro', 'err'); }
}

async function deleteMakro(id) {
  if (!confirm('Slet denne makro?')) return;
  try {
    await sbDelete('projekt_makroer?id=eq.' + id);
    makroer = makroer.filter(m => m.id !== id);
    renderGrafik();
    toast('Makro slettet', 'ok');
  } catch { toast('Fejl ved slet', 'err'); }
}

