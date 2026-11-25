// ── TABS ──────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'live')   startLivePolling();
    else                              stopLivePolling();
    if (btn.dataset.tab === 'grafik') { Promise.all([loadKunstomGrafik(), loadMakroer(), loadAfviklingslister(), loadAfviklingGrupper(), loadInfoBokse(), loadCompanionToken()]).then(() => refreshGrafiktState()); fetchLineupDataForGrafik(); }
    if (btn.dataset.tab === 'grafik-ops') { Promise.all([loadKunstomGrafik(), loadMakroer(), loadAfviklingslister(), loadFontLib(), loadInfoBokse(), loadCompanionToken()]).then(async () => { await refreshGrafiktState(); renderGrafikOps(); renderGraphicsAgent(); }); }
    if (btn.dataset.tab === 'info') refreshInfo();
    // SUBS (kun TV): gen-render ved faneskift, så subs oprettet mens man var i afvikling vises uden F5.
    // loadTvSubs er no-op for kampdag (tidlig return) + gate → kampdag urørt.
    if (btn.dataset.tab === 'subs' && typeof projektType !== 'undefined' && projektType === 'tv')
      loadTvSubs().then(() => renderSubs());
  });
});

// ── GRAFIK SETUP under-faner (Værktøjer / Grafik-agent) ──
document.querySelectorAll('.gops-subtab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gops-subtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const showAgent = btn.dataset.gops === 'agent';
    const tools = document.getElementById('grafikOpsList');
    const agent = document.getElementById('graphicsAgentApp');
    if (tools) tools.style.display = showAgent ? 'none' : '';
    if (agent) agent.style.display = showAgent ? '' : 'none';
    if (showAgent) renderGraphicsAgent();
  });
});


// ── Projekttype ved opstart (review C33) ──────────────────────
// Typen (kampdag/tv) afgør hele panelets opsætning. Hent den pålideligt: r.ok-tjek, 3 forsøg (straks, +1 s, +2 s)
// med 4 s timeout hver. Ved succes huskes typen i browseren; fejler alle forsøg, bruges den huskede type som reserve
// (så Kampdag virker som før ved et netblink). Findes ingen → kast fejl → _visInitFejl.
async function _hentProjektInfo() {
  const _lsKey = 'vmix_projekttype_' + aktivProjektId;
  const ventMs = [0, 1000, 2000];
  let sidsteFejl = null;
  for (let n = 0; n < ventMs.length; n++) {
    if (ventMs[n]) {
      const l = document.querySelector('#pageLoader > div');
      if (l) l.textContent = 'INDLÆSER — PRØVER IGEN…';
      await new Promise(res => setTimeout(res, ventMs[n]));
    }
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(SB_URL + '/rest/v1/projekter?id=eq.' + aktivProjektId + '&select=undertitel,type',
        { headers: SB_HEADERS, signal: ctrl.signal });
      clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows[0]) throw new Error('projektet blev ikke fundet');
      try { localStorage.setItem(_lsKey, rows[0].type || ''); } catch {}
      return rows[0];
    } catch (e) {
      sidsteFejl = e;
      console.warn('[init] projekttype-opslag fejlede (forsøg ' + (n + 1) + '):', e && e.message);
    }
  }
  let gemt = null;
  try { gemt = localStorage.getItem(_lsKey); } catch {}
  if (gemt) {
    console.warn('[init] bruger browserens sidst kendte projekttype som reserve:', gemt);
    return { type: gemt, undertitel: '' };
  }
  throw sidsteFejl || new Error('ukendt fejl');
}

// Anvend projekttypen: undertitel + TV-opsætning af faner. (Flyttet uændret fra init's tidligere .then-blok.)
function _anvendProjektType(info) {
  if (info.undertitel) {
    document.getElementById('projectUndertitel').textContent = info.undertitel;
  }
  projektType = info.type;
  // INFO-fane: individuel i HVERT TV-projekt (egne info-bokse, isoleret pr. projekt_id).
  // Ikke i kampdag. Opret/rediger/slet sker her; output i GRAFIK SETUP; PÅ/AF i afvikling.
  if (projektType === 'tv') {
    const infoBtn = document.querySelector('.tab-btn[data-tab="info"]');
    if (infoBtn) infoBtn.style.display = '';
    refreshInfo();
    // (Dynamiske subs: tv_subs hentes i init() FØR SUBS tegnes.)
    // Lyt på trigger-kanalen fra start (ellers først ved panelets første broadcast), så "grafik færdig"
    // fra overlayet også når frem, når fx credits er startet fra Companion.
    if (typeof _ensureBcChannel === 'function') _ensureBcChannel(aktivProjektId);
  }
  if (info.type === 'tv') {
    // Skjul KAMPE, STAMDATA, GRAFIK og DASHBOARD — aktiver SUBS som standard
    const kampeBtn     = document.querySelector('.tab-btn[data-tab="kampe"]');
    const stamdataBtn  = document.querySelector('.tab-btn[data-tab="admin"]');
    const dashboardBtn = document.querySelector('.tab-btn[data-tab="live"]');
    const grafikBtn    = document.querySelector('.tab-btn[data-tab="grafik"]');
    const subsBtn      = document.querySelector('.tab-btn[data-tab="subs"]');
    if (kampeBtn)     kampeBtn.style.display     = 'none';
    if (stamdataBtn)  stamdataBtn.style.display  = 'none';
    if (dashboardBtn) dashboardBtn.style.display = 'none';
    // GRAFIK-fanen (afvikling: preview + PÅ/AF + makroer) vises nu i ALLE projekter.
    void grafikBtn;
    // Skjul også STAMDATA-knappen i headeren
    const headerStamdataBtn = document.querySelector('header .tab-btn[data-tab="admin"]');
    if (headerStamdataBtn) headerStamdataBtn.style.display = 'none';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    if (subsBtn) subsBtn.classList.add('active');
    document.getElementById('tab-subs').classList.add('active');
  }
}

// Fejlskærm i det eksisterende fuldskærms-overlay: panelet tegnes IKKE i en gættet tilstand.
function _visInitFejl(tekst) {
  const l = document.getElementById('pageLoader');
  if (!l) return;
  l.style.display = 'flex'; l.style.opacity = '1';
  l.innerHTML = '<div style="text-align:center;max-width:520px;padding:24px;font-family:Segoe UI,system-ui,sans-serif;">'
    + '<div style="color:#ef4444;font-size:18px;font-weight:700;margin-bottom:10px;">Kunne ikke hente projektet</div>'
    + '<div style="color:#bbb;font-size:15px;line-height:1.6;margin-bottom:18px;">' + esc(tekst)
    + '<br>Tjek forbindelsen og prøv igen.</div>'
    + '<button class="btn btn-save" onclick="location.reload()">Genindlæs</button></div>';
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  const session = await requireAuth();
  if (!session) return;

  loadCompanionToken(); // trigger-token til Companion-URLs (fire-and-forget)

  // Header-knapper
  document.getElementById('backBtn').addEventListener('click', () => { window.location.href = 'projects.html'; });
  document.getElementById('logoutBtn').addEventListener('click', () => signOut());

  // Presence — vis at brugeren er online
  const _presenceSide = aktivProjektId ? 'app:' + aktivProjektId : 'app';
  const _presenceCh = sbClient.channel('online-users');
  _presenceCh.subscribe(async status => {
    if (status === 'SUBSCRIBED') {
      await _presenceCh.track({ user_id: session.user.id, email: session.user.email, side: _presenceSide });
    }
  });

  // Projektets type hentes PARALLELT med data (ingen ekstra ventetid), men intet tegnes, før typen er kendt —
  // ellers kunne et TV-projekt køre videre i Kampdag-tilstand, hvis opslaget fejlede (review C33).
  const _infoP = aktivProjektId ? _hentProjektInfo() : Promise.resolve(null);
  _infoP.catch(() => {});   // undgå "unhandled rejection" mens fetchAll kører; fejlen håndteres nedenfor

  try {
    const all = await fetchAll();

    let _info;
    try { _info = await _infoP; }
    catch (e) { _visInitFejl(e && e.message ? e.message : String(e)); return; }   // tegn INTET — gæt aldrig typen
    if (_info) _anvendProjektType(_info);
    if (projektType === 'tv') { try { await loadTvSubs(); } catch (e) { console.error('[init] tv_subs:', e); } }

    dropdowns = all.dropdowns;

    all.kampe.forEach((data, i) => { kampe[i] = { ...kampe[i], ...data }; });

    if (all.subs) {
      // Placér hver sub ved sin PLADS (data.slot-1), ikke ved række-rækkefølge — så huller (TV) ikke
      // forskyder pladserne. Kampdag byte-identisk: sammenhængende 1-15 → slot-1 === den gamle index.
      all.subs.subs.forEach(data => { const i = (data.slot || 0) - 1; if (i >= 0) subs[i] = { ...(subs[i] || makeSub()), ...data }; });
      all.subs.vmixCalls.forEach((data, i) => { vmixCalls[i] = { ...vmixCalls[i], ...data }; });
      if (typeof _afvSrcOk !== 'undefined') _afvSrcOk.subs = true;   // subs hentet OK → afviklingen må synke
    }

    if (all.tickers) {
      all.tickers.forEach((data, i) => { tickers[i] = { ...tickers[i], ...data }; });
    }

    if (all.credits) {
      initCreditsFromData(all.credits);
    }

    // Robusthed: hent komm-master (grafik på/af) fra DB, så master-kontakten
    // overlever en panel-genindlæsning uanset hvilken fane der er åben.
    if (aktivProjektId) {
      try {
        const kmRows = await sbGet('settings?select=value&key=eq.komm_master&projekt_id=eq.' + aktivProjektId);
        _kommPaaMode = (kmRows[0]?.value === 'on');
      } catch {}
    }

    document.getElementById('previewClose').addEventListener('click', () => {
      document.getElementById('previewModal').style.display = 'none';
      { const _pf = document.getElementById('previewFrame'); _pf.removeAttribute('srcdoc'); _pf.src = ''; }
    });
    document.getElementById('previewModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        e.currentTarget.style.display = 'none';
        { const _pf = document.getElementById('previewFrame'); _pf.removeAttribute('srcdoc'); _pf.src = ''; }
      }
    });

    renderAll();
    renderSubs();
    renderTickers();
    renderCredits();
    await refreshDropdowns();
    fetchLiveMatches();
    initStamdata();
    const loader = document.getElementById('pageLoader');
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 200);
  } catch (err) {
    document.getElementById('pageLoader').style.display = 'none';
    document.getElementById('kampList').innerHTML =
      `<div class="load-err">Fejl ved indlæsning.<br>Tjek Supabase forbindelsen.<br><small style="color:#555">${err.message}</small></div>`;
  }
}

init();

