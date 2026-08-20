// ── TABS ──────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'live')   startLivePolling();
    else                              stopLivePolling();
    if (btn.dataset.tab === 'grafik') { Promise.all([loadKunstomGrafik(), loadMakroer(), loadCompanionToken()]).then(() => refreshGrafiktState()); fetchLineupDataForGrafik(); }
    if (btn.dataset.tab === 'grafik-ops') { Promise.all([loadKunstomGrafik(), loadMakroer(), loadCompanionToken()]).then(() => { refreshGrafiktState(); renderGrafikOps(); }); }
  });
});


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

  // Vis projekt-undertitel fra URL hvis tilgængeligt
  if (aktivProjektId) {
    fetch(SB_URL + '/rest/v1/projekter?id=eq.' + aktivProjektId + '&select=undertitel,type', { headers: SB_HEADERS })
      .then(r => r.json())
      .then(rows => {
        if (!rows[0]) return;
        if (rows[0].undertitel) {
          document.getElementById('projectUndertitel').textContent = rows[0].undertitel;
        }
        projektType = rows[0].type;
        if (rows[0].type === 'tv') {
          // Skjul KAMPE, STAMDATA, GRAFIK og DASHBOARD — aktiver SUBS som standard
          const kampeBtn     = document.querySelector('.tab-btn[data-tab="kampe"]');
          const stamdataBtn  = document.querySelector('.tab-btn[data-tab="admin"]');
          const dashboardBtn = document.querySelector('.tab-btn[data-tab="live"]');
          const grafikBtn    = document.querySelector('.tab-btn[data-tab="grafik"]');
          const subsBtn      = document.querySelector('.tab-btn[data-tab="subs"]');
          if (kampeBtn)     kampeBtn.style.display     = 'none';
          if (stamdataBtn)  stamdataBtn.style.display  = 'none';
          if (dashboardBtn) dashboardBtn.style.display = 'none';
          if (grafikBtn)    grafikBtn.style.display    = 'none';
          // Skjul også STAMDATA-knappen i headeren
          const headerStamdataBtn = document.querySelector('header .tab-btn[data-tab="admin"]');
          if (headerStamdataBtn) headerStamdataBtn.style.display = 'none';
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
          if (subsBtn) subsBtn.classList.add('active');
          document.getElementById('tab-subs').classList.add('active');
        }
      }).catch(() => {});
  }

  try {
    const all = await fetchAll();

    dropdowns = all.dropdowns;

    all.kampe.forEach((data, i) => { kampe[i] = { ...kampe[i], ...data }; });

    if (all.subs) {
      all.subs.subs.forEach((data, i)      => { subs[i]      = { ...subs[i],      ...data }; });
      all.subs.vmixCalls.forEach((data, i) => { vmixCalls[i] = { ...vmixCalls[i], ...data }; });
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
      document.getElementById('previewFrame').src = '';
    });
    document.getElementById('previewModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        e.currentTarget.style.display = 'none';
        document.getElementById('previewFrame').src = '';
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

