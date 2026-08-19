// ── LIVE DASHBOARD — funktioner (state i app-state.js) ──────────
function startLivePolling() {
  fetchLiveMatches();
  liveTimer = setInterval(fetchLiveMatches, 60000);
}

function stopLivePolling() {
  clearInterval(liveTimer);
  liveTimer = null;
}

async function fetchLiveMatches() {
  const grid = document.getElementById('liveGrid');
  const upd  = document.getElementById('liveUpdated');
  if (!grid) return;

  const enetIds = kampe.filter(k => k.enetpulseId).map(k => k.enetpulseId);

  if (!enetIds.length) {
    grid.innerHTML = '<div class="live-no-fixtures">INGEN KAMPE VALGT</div>';
    upd.textContent = '';
    return;
  }

  try {
    const enetData = await apiFetch('/api/enetpulse?ids=' + enetIds.join(',')).then(r => r.json()).catch(() => ({ matches: [] }));

    const enetMap = {};
    (enetData.matches || []).forEach(m => { if (m.id) enetMap[String(m.id)] = m; });

    // Berig enetpulse-kampe med lokale holdnavne fra kamp-state
    // Hvis et navn matcher et enet_navn i dropdowns, bruges alias i stedet
    const resolveAlias = name => {
      if (!name) return name;
      const d = dropdowns.holds.find(h => h.enetNavn === name);
      return d ? d.lang : name;
    };
    for (const k of kampe) {
      if (!k.enetpulseId) continue;
      const m = enetMap[String(k.enetpulseId)];
      if (!m || m.error) continue;
      m.home = resolveAlias(k.hold1Lang || m.home_api) || m.home;
      m.away = resolveAlias(k.hold2Lang || m.away_api) || m.away;
      if (k.hold1Kort) m.home_kort = k.hold1Kort;
      if (k.hold2Kort) m.away_kort = k.hold2Kort;
    }

    // Gem part_fk på kampe-state og rerender blokke hvor det ændrer sig
    for (let i = 0; i < kampe.length; i++) {
      const k = kampe[i];
      if (!k.enetpulseId) continue;
      const m = enetMap[String(k.enetpulseId)];
      if (!m || m.error) continue;
      const fk1 = m.home_part_fk || null;
      const fk2 = m.away_part_fk || null;
      const st  = m.starttime || '';
      if (fk1 !== kampe[i].hold1PartFk || fk2 !== kampe[i].hold2PartFk || st !== kampe[i].starttime) {
        kampe[i].hold1PartFk = fk1;
        kampe[i].hold2PartFk = fk2;
        kampe[i].starttime   = st;
        rerender(i);
      }
    }

    // Gem match-objekter til brug i sendLineupOnAir
    Object.entries(enetMap).forEach(([id, m]) => liveMatchData.set(id, m));

    // Vis kort i slot-rækkefølge
    const cards = [];
    for (let i = 0; i < kampe.length; i++) {
      const k = kampe[i];
      if (k.enetpulseId && enetMap[String(k.enetpulseId)]) {
        cards.push(renderLiveCard(enetMap[String(k.enetpulseId)]));
      }
    }
    grid.innerHTML = cards.length ? cards.join('') : '<div class="live-no-fixtures">INGEN KAMPE VALGT</div>';
    grid.querySelectorAll('.live-lineup-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const id   = String(btn.dataset.id);
        const open = liveExpandedLineup.has(id);
        if (open) liveExpandedLineup.delete(id); else liveExpandedLineup.add(id);
        btn.textContent = 'OPSTILLING ' + (open ? '▾' : '▴');
        btn.nextElementSibling.style.display = open ? 'none' : 'block';
      });
    });
    grid.querySelectorAll('.lu-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const id   = String(btn.dataset.id);
        const mode = btn.dataset.mode;
        livePitchMode.set(id, mode);
        const wrap = btn.closest('.live-lineup-wrap');
        wrap.querySelectorAll('.lu-tab').forEach(b => b.classList.toggle('active', b === btn));
        wrap.querySelector('.live-lineup').style.display = mode === 'liste' ? 'flex' : 'none';
        wrap.querySelector('.pitch-wrap').style.display  = mode === 'bane'  ? 'flex' : 'none';
      });
    });

    // OPSTILLING ON AIR knapper
    grid.querySelectorAll('.lu-home-btn').forEach(btn => {
      btn.addEventListener('click', () => sendLineupSide(btn.dataset.id, 'home'));
    });
    grid.querySelectorAll('.lu-away-btn').forEach(btn => {
      btn.addEventListener('click', () => sendLineupSide(btn.dataset.id, 'away'));
    });
    grid.querySelectorAll('.lu-offair-btn').forEach(btn => {
      btn.addEventListener('click', () => sendLineupOff());
    });
    grid.querySelectorAll('.lu-preview-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const m  = liveMatchData.get(String(id));
        if (m) {
          const payload = buildLineupPayload(m);
          if (payload) {
            try { await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lineup_data', value: JSON.stringify(payload) }); } catch {}
          }
        }
        const modal = document.getElementById('previewModal');
        const frame = document.getElementById('previewFrame');
        frame.src = 'overlay-3?preview=home&p=' + aktivProjektId + '&t=' + Date.now();
        modal.style.display = 'flex';
      });
    });
    grid.querySelectorAll('.lu-vmix-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = `${location.origin}/overlay-3?p=${aktivProjektId}`;
        navigator.clipboard.writeText(url);
        btn.textContent = '✓ Kopieret!';
        setTimeout(() => { btn.textContent = '⧉ vMix URL'; }, 2000);
      });
    });

    // STATISTIK toggle
    grid.querySelectorAll('.live-stats-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = String(btn.dataset.id);
        const open = liveExpandedStats.has(id);
        if (open) { liveExpandedStats.delete(id); } else { liveExpandedStats.add(id); }
        const wrap  = btn.nextElementSibling;
        const inner = wrap.querySelector('.live-stats-inner');
        btn.textContent = 'STATISTIK ' + (open ? '▾' : '▴');
        wrap.style.display = open ? 'none' : 'block';
        if (!open) {
          inner.innerHTML = '<div class="pm-loading">Henter…</div>';
          const r = await apiFetch(`/api/standings?type=event_stats&object=event&objectFK=${encodeURIComponent(id)}`);
          const j = await r.json();
          const statsHtml = j.ok ? renderEventStats(j.data, btn.closest('.live-card')) : '<div class="pm-empty">Kampstatistik ikke tilgængelig</div>';
          liveStatsCache.set(id, statsHtml);
          inner.innerHTML = statsHtml;
        }
      });
    });

    // TABEL toggle
    grid.querySelectorAll('.live-table-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = String(btn.dataset.id);
        const open = liveExpandedTable.has(id);
        if (open) { liveExpandedTable.delete(id); } else { liveExpandedTable.add(id); }
        const wrap  = btn.nextElementSibling;
        const inner = wrap.querySelector('.live-table-inner');
        btn.textContent = 'TABEL ' + (open ? '▾' : '▴');
        wrap.style.display = open ? 'none' : 'block';
        if (!open) {
          const tab  = liveTableTab.get(id) || 'table';
          const tfk  = btn.dataset.tfk;
          const home = btn.dataset.home;
          const away = btn.dataset.away;
          if (!tfk) { inner.innerHTML = '<div class="pm-empty">Ingen turnering-FK</div>'; return; }
          if (tab === 'topscorer') {
            if (liveTopScorerCache.has(id)) { inner.innerHTML = liveTopScorerCache.get(id); return; }
            inner.innerHTML = '<div class="pm-loading">Henter…</div>';
            const r = await apiFetch(`/api/standings?type=topscorer&object=tournament_stage&objectFK=${encodeURIComponent(tfk)}`);
            const j = await r.json();
            const html = j.ok ? renderTopScorers(j.data, home, away) : '<div class="pm-empty">Topscorer ikke tilgængelig</div>';
            liveTopScorerCache.set(id, html);
            inner.innerHTML = html;
          } else {
            if (liveTableCache.has(id)) { inner.innerHTML = liveTableCache.get(id); return; }
            inner.innerHTML = '<div class="pm-loading">Henter…</div>';
            const r = await apiFetch(`/api/standings?type=leaguetable&object=tournament_stage&objectFK=${encodeURIComponent(tfk)}`);
            const j = await r.json();
            const html = j.ok ? renderLeagueTable(j.data, home, away) : '<div class="pm-empty">Ligatable ikke tilgængelig</div>';
            liveTableCache.set(id, html);
            inner.innerHTML = html;
          }
        }
      });
    });

    // TABEL sub-tabs (TABEL | TOPSCORER)
    grid.querySelectorAll('.table-subtab').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id  = String(btn.dataset.id);
        const tab = btn.dataset.tab;
        liveTableTab.set(id, tab);
        const wrap = btn.closest('.live-table-wrap');
        wrap.querySelectorAll('.table-subtab').forEach(b => b.classList.toggle('active', b === btn));
        const inner = wrap.querySelector('.live-table-inner');
        const card  = btn.closest('.live-card');
        const tfk   = card?.dataset.tfk || '';
        const home  = card?.querySelector('.live-team-name')?.textContent || '';
        const away  = card?.querySelectorAll('.live-team-name')[1]?.textContent || '';
        if (tab === 'topscorer') {
          if (liveTopScorerCache.has(id)) { inner.innerHTML = liveTopScorerCache.get(id); return; }
          inner.innerHTML = '<div class="pm-loading">Henter…</div>';
          if (!tfk) { inner.innerHTML = '<div class="pm-empty">Ingen turnering-FK</div>'; return; }
          const r = await apiFetch(`/api/standings?type=topscorer&object=tournament_stage&objectFK=${encodeURIComponent(tfk)}`);
          const j = await r.json();
          const html = j.ok ? renderTopScorers(j.data, home, away) : '<div class="pm-empty">Topscorer ikke tilgængelig</div>';
          liveTopScorerCache.set(id, html);
          inner.innerHTML = html;
        } else {
          if (liveTableCache.has(id)) { inner.innerHTML = liveTableCache.get(id); return; }
          inner.innerHTML = '<div class="pm-loading">Henter…</div>';
          if (!tfk) { inner.innerHTML = '<div class="pm-empty">Ingen turnering-FK</div>'; return; }
          const r = await apiFetch(`/api/standings?type=leaguetable&object=tournament_stage&objectFK=${encodeURIComponent(tfk)}`);
          const j = await r.json();
          const html = j.ok ? renderLeagueTable(j.data, home, away) : '<div class="pm-empty">Ligatable ikke tilgængelig</div>';
          liveTableCache.set(id, html);
          inner.innerHTML = html;
        }
      });
    });

    // H2H toggle
    grid.querySelectorAll('.live-h2h-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id   = String(btn.dataset.id);
        const open = liveExpandedH2H.has(id);
        if (open) { liveExpandedH2H.delete(id); } else { liveExpandedH2H.add(id); }
        const wrap  = btn.nextElementSibling;
        const inner = wrap.querySelector('.live-h2h-inner');
        btn.textContent = 'H2H ' + (open ? '▾' : '▴');
        wrap.style.display = open ? 'none' : 'block';
        if (!open) {
          if (liveH2HCache.has(id)) { inner.innerHTML = liveH2HCache.get(id); return; }
          inner.innerHTML = '<div class="pm-loading">Henter…</div>';
          const p1   = btn.dataset.hpfk;
          const p2   = btn.dataset.apfk;
          const home = btn.dataset.home;
          const away = btn.dataset.away;
          if (!p1 || !p2) { inner.innerHTML = '<div class="pm-empty">Mangler hold-FK</div>'; return; }
          const r = await apiFetch(`/api/enetpulse?h2h=1&p1=${encodeURIComponent(p1)}&p2=${encodeURIComponent(p2)}`);
          const j = await r.json();
          const html = j.ok ? renderH2H(j.data, home, away) : '<div class="pm-empty">H2H ikke tilgængelig</div>';
          liveH2HCache.set(id, html);
          inner.innerHTML = html;
        }
      });
    });

    // Auto-åbn og opdater STATISTIK for kampe i gang
    for (const k of kampe) {
      if (!k.enetpulseId) continue;
      const m = enetMap[String(k.enetpulseId)];
      if (!m || m.error) continue;
      if (!['1H','2H','HT','ET','P','LIVE'].includes(m.status?.short)) continue;
      const mid = String(m.id);
      liveExpandedStats.add(mid);
      const card  = grid.querySelector(`.live-card[data-mid="${mid}"]`);
      if (!card) continue;
      const wrap  = card.querySelector('.live-stats-wrap');
      const inner = card.querySelector('.live-stats-inner');
      const btn   = card.querySelector('.live-stats-toggle');
      if (!wrap || !inner || !btn) continue;
      wrap.style.display = 'block';
      btn.textContent = 'STATISTIK ▴';
      if (!liveStatsCache.has(mid)) inner.innerHTML = '<div class="pm-loading">Henter…</div>';
      apiFetch(`/api/standings?type=event_stats&object=event&objectFK=${encodeURIComponent(mid)}`)
        .then(r => r.json())
        .then(j => {
          const html = j.ok ? renderEventStats(j.data, card) : '<div class="pm-empty">Kampstatistik ikke tilgængelig</div>';
          liveStatsCache.set(mid, html);
          inner.innerHTML = html;
        })
        .catch(() => {});
    }

    upd.textContent = 'Sidst opdateret ' + new Date().toLocaleTimeString('da-DK');

    // Status til Supabase + korttal via broadcast — enetpulse-kampe
    for (let i = 0; i < kampe.length; i++) {
      const k = kampe[i];
      if (!k.enetpulseId) continue;
      const m = enetMap[String(k.enetpulseId)];
      if (!m || m.error) continue;
      await sbPatch('kampe?projekt_id=eq.' + aktivProjektId + '&slot=eq.' + (i + 1), {
        status_short:   m.status.short   || null,
        status_elapsed: m.status.elapsed ?? null
      }).catch(() => {});
      const isHomeEv = e => e.team === m.home_api || e.team === m.home;
      const isCard   = e => e.type === 'Card';
      const evts = Array.isArray(m.events) ? m.events : [];
      const g1 = evts.filter(e => isCard(e) && e.detail === 'Yellow Card' &&  isHomeEv(e)).length;
      const r1 = evts.filter(e => isCard(e) && (e.detail === 'Red Card' || e.detail === 'Yellow Red Card') &&  isHomeEv(e)).length;
      const g2 = evts.filter(e => isCard(e) && e.detail === 'Yellow Card' && !isHomeEv(e)).length;
      const r2 = evts.filter(e => isCard(e) && (e.detail === 'Red Card' || e.detail === 'Yellow Red Card') && !isHomeEv(e)).length;
      try {
        _ensureBcChannel(aktivProjektId);
        _bcChannel.send({ type: 'broadcast', event: 'cards',
          payload: { projekt_id: aktivProjektId, slot: i + 1, g1, r1, g2, r2 } });
        _broadcastKampState(i, m.status.short || null, m.status.elapsed ?? null);
      } catch { /* non-critical */ }
    }

  } catch { upd.textContent = 'Netværksfejl'; }
}

function liveStatusClass(short) {
  if (['1H','2H','ET','P','LIVE'].includes(short)) return 'playing';
  if (short === 'HT') return 'ht';
  if (short === 'FT' || short === 'AET' || short === 'PEN') return 'ft';
  return 'ns';
}

function liveStatusLabel(status) {
  const min = status.elapsed != null ? ' · ' + status.elapsed + "'" : '';
  if (status.short === 'NS')  return 'IKKE STARTET';
  if (status.short === 'HT')  return 'PAUSE';
  if (status.short === 'FT')  return 'SLUTFLØJT';
  if (status.short === 'AET') return 'EFTER FORLÆNGING';
  if (status.short === 'PEN') return 'EFTER STRAFFE';
  if (status.short === '1H')  return '1. HALVLEG' + min;
  if (status.short === '2H')  return '2. HALVLEG' + min;
  if (status.short === 'ET')  return 'FORLÆNGING' + min;
  if (status.short === 'P')   return 'STRAFFESPARK';
  if (status.elapsed != null) return status.elapsed + "'";
  return status.short;
}

function liveEventIcon(type, detail) {
  if (type === 'Goal') {
    if (detail === 'Disallowed Goal') return 'vog';
    if (detail === 'Own Goal')   return 'og';
    if (detail === 'Penalty')    return 'pen';
    return 'goal';
  }
  if (type === 'Card') {
    if (detail === 'Yellow Card')            return 'yc';
    if (detail === 'Red Card')               return 'rc';
    if (detail === 'Yellow Red Card')        return 'yr';
  }
  if (type === 'subst') return 'sub';
  return 'sub';
}

function renderLiveCard(m) {
  if (m.error) return `<div class="live-card"><div class="live-card-header"><div class="live-league">${m.id}</div><div class="live-no-fixtures" style="padding:20px">${m.error}</div></div></div>`;

  const statusCls   = liveStatusClass(m.status.short);
  const statusLabel = liveStatusLabel(m.status);

  const eventsHtml = m.events.length
    ? m.events.map(e => {
        const iconCls = liveEventIcon(e.type, e.detail);
        const isAway  = e.team === m.away_api || e.team === m.away;
        const assist  = e.assist ? ` <span class="live-event-assist">(${e.assist})</span>` : '';
        const subInfo = e.type === 'subst'
          ? `<span class="live-event-name"><span style="color:var(--green)">▲</span> ${e.player}${e.assist ? ` <span style="color:var(--red)">▼</span> ${e.assist}` : ''}</span>`
          : `<span class="live-event-name">${e.player}${assist}</span>`;
        const cancelledCls = e.detail === 'Disallowed Goal' ? ' cancelled' : '';
        return `<div class="live-event${isAway ? ' away' : ''}${cancelledCls}">
          <span class="live-event-min">${e.minute}'</span>
          <span class="live-event-icon ${iconCls}"></span>
          ${subInfo}
        </div>`;
      }).join('')
    : '<div class="live-event" style="color:#333;justify-content:center">ingen hændelser endnu</div>';

  const mid = String(m.id);
  const statsOpen = liveExpandedStats.has(mid);
  const tableOpen = liveExpandedTable.has(mid);
  const h2hOpen   = liveExpandedH2H.has(mid);
  const tableTab  = liveTableTab.get(mid) || 'table';
  return `
    <div class="live-card" data-tfk="${m.tournament_fk || ''}" data-mid="${mid}" data-hpfk="${m.home_part_fk || ''}" data-apfk="${m.away_part_fk || ''}">
      <div class="live-card-header">
        <div class="live-score-row">
          <span class="live-team">
            ${m.home_part_fk ? `<img class="live-team-logo" src="/api/team-image?teamFK=${m.home_part_fk}&v=3" onerror="this.style.display='none'" alt="">` : ''}
            <span class="live-team-name">${m.home}</span>
            ${m.home_kort ? `<span class="live-team-kort">${m.home_kort}</span>` : ''}
          </span>
          <span class="live-score">${m.homeGoals} – ${m.awayGoals}</span>
          <span class="live-team away">
            ${m.away_part_fk ? `<img class="live-team-logo" src="/api/team-image?teamFK=${m.away_part_fk}&v=3" onerror="this.style.display='none'" alt="">` : ''}
            <span class="live-team-name">${m.away}</span>
            ${m.away_kort ? `<span class="live-team-kort">${m.away_kort}</span>` : ''}
          </span>
        </div>
        <div class="live-status ${statusCls}">${statusLabel}</div>
        ${(() => {
          if (!m.periods || !m.periods.length) return '';
          const short = m.status?.short;
          const show = m.periods.filter(p =>
            p.label === '1H' ||
            (p.label === '2H' && ['2H','ET','FT','AET','PEN'].includes(short)) ||
            p.label === 'OT'
          );
          if (!show.length) return '';
          return `<div class="live-periods">${show.map(p => `<span class="live-period-item">${p.label}: ${p.home}–${p.away}</span>`).join('')}</div>`;
        })()}
        <div class="live-league">${m.league}</div>
      </div>
      <div class="live-events">${eventsHtml}</div>
      <button class="live-stats-toggle" data-id="${mid}">STATISTIK ${statsOpen ? '▴' : '▾'}</button>
      <div class="live-stats-wrap" style="display:${statsOpen ? 'block' : 'none'}">
        <div class="live-stats-inner" data-id="${mid}">${liveStatsCache.get(mid) || '<div class="pm-loading">Henter…</div>'}</div>
      </div>
      <button class="live-table-toggle" data-id="${mid}" data-tfk="${m.tournament_fk || ''}" data-home="${m.home}" data-away="${m.away}">TABEL ${tableOpen ? '▴' : '▾'}</button>
      <div class="live-table-wrap" style="display:${tableOpen ? 'block' : 'none'}">
        <div class="table-subtabs">
          <button class="table-subtab${tableTab === 'table' ? ' active' : ''}" data-id="${mid}" data-tab="table">TABEL</button>
          <button class="table-subtab${tableTab === 'topscorer' ? ' active' : ''}" data-id="${mid}" data-tab="topscorer">TOPSCORER</button>
        </div>
        <div class="live-table-inner" data-id="${mid}">${tableTab === 'table' ? (liveTableCache.get(mid) || '<div class="pm-loading">Henter…</div>') : (liveTopScorerCache.get(mid) || '<div class="pm-loading">Henter…</div>')}</div>
      </div>
      <button class="live-h2h-toggle" data-id="${mid}" data-hpfk="${m.home_part_fk || ''}" data-apfk="${m.away_part_fk || ''}" data-home="${m.home}" data-away="${m.away}">H2H ${h2hOpen ? '▴' : '▾'}</button>
      <div class="live-h2h-wrap" style="display:${h2hOpen ? 'block' : 'none'}">
        <div class="live-h2h-inner" data-id="${mid}">${liveH2HCache.get(mid) || '<div class="pm-loading">Henter…</div>'}</div>
      </div>
      ${renderLineup(m.lineup, m.home, m.away, m.id, m.home_part_fk, m.away_part_fk)}
    </div>`;
}

const FORMATION_MAP = {
  '1':'4-4-2','2':'4-3-3','3':'3-5-2','4':'5-3-2','5':'4-5-1',
  '6':'4-2-3-1','7':'3-4-3','8':'5-4-1','9':'3-4-1-2','10':'4-1-4-1',
  '11':'4-3-1-2','12':'4-4-1-1','13':'3-3-4','14':'4-1-2-1-2','15':'4-3-2-1',
  '16':'4-1-3-2','17':'3-1-4-2','18':'4-2-4','19':'5-2-3','20':'3-4-2-1',
  '21':'4-2-2-2','22':'3-5-1-1','23':'4-4-2','24':'4-1-2-3',
};

function renderPitch(lineup, homeName, awayName, homeFK, awayFK) {
  if (!lineup) return '';
  const homePlayers = (lineup.home || []).filter(p => p.starter);
  const awayPlayers = (lineup.away || []).filter(p => p.starter);
  if (!homePlayers.length && !awayPlayers.length) return '';

  // Hvert hold vises på sin egen halvbane — GK i bunden, angribere øverst
  // rawPos-tærskler: <=20=GK, <=60=DEF, <=82=MF, <=100=AMF, >100=FWD
  const ZONE_Y = { MV: 88, FB: 68, MF: 52, AMF: 34, A: 20 };

  function pitchZone(p) {
    if (!p.rawPos) return p.pos || 'MF';
    if (p.rawPos <= 20)  return 'MV';
    if (p.rawPos <= 60)  return 'FB';
    if (p.rawPos <= 82)  return 'MF';
    if (p.rawPos <= 100) return 'AMF';
    return 'A';
  }

  function formation(players) {
    const lines = {};
    for (const p of players) {
      const z = pitchZone(p);
      if (z === 'MV') continue;
      lines[z] = (lines[z] || 0) + 1;
    }
    return ['FB','MF','AMF','A'].map(z => lines[z]).filter(Boolean).join('-');
  }

  function halfPitch(players, side, partFK, label) {
    const zones = { MV: [], FB: [], MF: [], AMF: [], A: [] };
    for (const p of players) zones[pitchZone(p)].push(p);

    const playersHtml = Object.entries(zones).map(([pos, group]) => {
      if (!group.length) return '';
      if (side === 'home') {
        group.sort((a, b) => b.enetPos - a.enetPos);
      } else {
        group.sort((a, b) => a.enetPos - b.enetPos);
      }
      const baseY   = ZONE_Y[pos] ?? 50;
      const twoRows = group.length >= 5;
      const rowSize = twoRows ? Math.ceil(group.length / 2) : group.length;
      return group.map((p, i) => {
        const row      = twoRows ? Math.floor(i / rowSize) : 0;
        const idxInRow = i % rowSize;
        const rowLen   = (row === 0) ? rowSize : group.length - rowSize;
        const x = ((idxInRow + 1) / (rowLen + 1) * 100).toFixed(1);
        const y = (baseY + (twoRows ? (row === 0 ? -7 : 7) : 0)).toFixed(1);
        const parts     = p.name.trim().split(' ');
        const firstName = esc(parts[0] || '');
        const lastName  = esc(parts.slice(1).join(' ') || parts[0] || '');
        const circleContent = partFK
          ? `<img class="pitch-player-photo" src="https://driu3sl4x7vty.cloudfront.net/spdk/current/524x584/${partFK}/${p.id}.png" alt="">`
          : p.shirt;
        return `<div class="pitch-player ${side}${p.id ? ' lu-clickable' : ''}" style="left:${x}%;top:${y}%;" data-pid="${p.id || ''}" data-pname="${esc(p.name)}" data-tpfk="${partFK || ''}">
          <div class="pitch-player-circle${partFK ? ' has-photo' : ''}">${circleContent}</div>
          <div class="pitch-player-name"><span class="pp-first">${firstName}</span><span class="pp-last">${lastName}</span></div>
        </div>`;
      }).join('');
    }).join('');

    const fmn = formation(players);
    return `<div class="pitch-half-wrap">
      <div class="pitch-inner">
        <div class="pitch-half-label">${esc(label)}</div>
        <svg class="pitch-lines" viewBox="0 0 100 140" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="1" width="98" height="138" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.8"/>
          <line x1="1" y1="70" x2="99" y2="70" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
          <circle cx="50" cy="70" r="9.15" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
          <rect x="22" y="109" width="56" height="30" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
          <rect x="36" y="127" width="28" height="12" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
          <rect x="22" y="1" width="56" height="30" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
          <rect x="36" y="1" width="28" height="12" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
          <circle cx="50" cy="122" r="0.8" fill="rgba(255,255,255,0.2)"/>
          <circle cx="50" cy="18" r="0.8" fill="rgba(255,255,255,0.2)"/>
        </svg>
        ${fmn ? `<div class="pitch-formation" style="bottom:5px;left:50%;transform:translateX(-50%)">${fmn}</div>` : ''}
        ${playersHtml}
      </div>
    </div>`;
  }

  return `${halfPitch(homePlayers, 'home', homeFK, homeName || 'Hjemme')}${halfPitch(awayPlayers, 'away', awayFK, awayName || 'Ude')}`;
}

function renderEventStats(data, cardEl) {
  const standings = data?.standings || data?.standing;
  if (!standings) return '<div class="pm-empty">Ingen data</div>';
  const entry = Object.values(standings)[0];
  if (!entry) return '<div class="pm-empty">Ingen data</div>';

  const participants = entry.standing_participants || {};
  const parts = Object.values(participants);
  if (parts.length < 2) return '<div class="pm-empty">Utilstrækkelige data</div>';

  const getData = (part) => {
    const sd = {};
    const arr = Array.isArray(part.standing_data) ? part.standing_data : Object.values(part.standing_data || {});
    arr.forEach(d => { if (d.code) sd[d.code] = d.value; });
    return { name: part.participant?.name || part.name || '', sd };
  };

  const p1 = getData(parts[0]);
  const p2 = getData(parts[1]);

  const LABELS = {
    possession:    'Boldbesiddelse %',
    shoton:        'Skud på mål',
    shotoff:       'Skud forbi',
    goal_attempt:  'Skudforsøg i alt',
    corner:        'Hjørnespark',
    offside:       'Offside',
    yellow_cards:  'Gule kort',
    red_cards:     'Røde kort',
    foulcommit:    'Frispark',
    saves:         'Redninger',
    dangerous_attacks: 'Farlige angreb',
    attacks:       'Angreb',
  };

  const rows = Object.entries(LABELS).map(([k, label]) => {
    const hv = p1.sd[k] ?? '—';
    const av = p2.sd[k] ?? '—';
    return `<tr><td class="es-home">${hv}</td><td class="es-label">${label}</td><td class="es-away">${av}</td></tr>`;
  }).join('');

  return `
    <div style="display:flex;justify-content:space-between;padding:6px 8px 2px;font-size:10px;">
      <span style="color:var(--orange);font-weight:600">${p1.name}</span>
      <span style="color:#3b82f6;font-weight:600">${p2.name}</span>
    </div>
    <table class="event-stats-table"><tbody>${rows}</tbody></table>`;
}

function renderLeagueTable(data, home, away) {
  const standings = data?.standings || data?.standing;
  if (!standings) return '<div class="pm-empty">Ingen data</div>';
  const entry = Object.values(standings)[0];
  if (!entry) return '<div class="pm-empty">Ingen data</div>';

  const participants = entry.standing_participants || {};
  const rows = Object.values(participants);
  if (!rows.length) return '<div class="pm-empty">Ingen deltagere</div>';

  // Udtræk standing_data til flat objekt pr. deltager (array format)
  const parsed = rows.map(p => {
    const sd = {};
    const arr = Array.isArray(p.standing_data) ? p.standing_data : Object.values(p.standing_data || {});
    arr.forEach(d => { if (d.code) sd[d.code] = d.value; });
    const name = p.participant?.name || p.name || p.participant_name || '';
    return { name, rank: parseInt(p.rank || '999'), ...sd };
  });

  // Sorter efter rank, derefter points
  parsed.sort((a, b) => {
    const ra = parseInt(a.rank || a.position || '999');
    const rb = parseInt(b.rank || b.position || '999');
    if (ra !== rb) return ra - rb;
    return parseInt(b.points || b.pts || '0') - parseInt(a.points || a.pts || '0');
  });

  const homeLow = (home || '').toLowerCase();
  const awayLow = (away || '').toLowerCase();

  const tableRows = parsed.map((p, i) => {
    const rank = p.rank || p.position || (i + 1);
    const name = p.name;
    const nameLow = name.toLowerCase();
    const isHome = homeLow && nameLow.includes(homeLow.substring(0, 4));
    const isAway = awayLow && nameLow.includes(awayLow.substring(0, 4));
    const cls    = isHome ? ' class="lt-home"' : isAway ? ' class="lt-away"' : '';
    const played = p.played || p.matches_played || p.total_matches || '—';
    const wins   = p.wins || p.won || '—';
    const draws  = p.draws || p.draw || '—';
    const losses = p.defeits || p.losses || p.lost || '—';
    const gf     = p.goalsfor || p.goals_for || p.scored || '—';
    const ga     = p.goalsagainst || p.goals_against || p.conceded || '—';
    const pts    = p.points || p.pts || '—';
    return `<tr${cls}><td>${rank}</td><td class="lt-name">${name}</td><td>${played}</td><td>${wins}</td><td>${draws}</td><td>${losses}</td><td>${gf}</td><td>${ga}</td><td>${pts}</td></tr>`;
  }).join('');

  return `<table class="league-table">
    <thead><tr><th>#</th><th class="lt-name">Hold</th><th>K</th><th>V</th><th>U</th><th>T</th><th>MF</th><th>MA</th><th>P</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>`;
}

function renderTopScorers(data, homeName, awayName) {
  const standings = data?.standings || data?.standing;
  if (!standings) return '<div class="pm-empty">Ingen data</div>';
  const entry = Object.values(standings)[0];
  if (!entry) return '<div class="pm-empty">Ingen data</div>';

  const participants = entry.standing_participants || {};
  if (!Object.keys(participants).length) return '<div class="pm-empty">Ingen spillere</div>';

  const parsed = Object.values(participants).map(p => {
    const sd  = {};
    const arr = Array.isArray(p.standing_data) ? p.standing_data : Object.values(p.standing_data || {});
    arr.forEach(d => { if (d.code) sd[d.code] = d.value; });
    const name     = p.participant?.name || p.name || '';
    const teamName = p.team?.name || p.team_name || p.participant?.team_name || '';
    return { name, teamName, rank: parseInt(p.rank || '999'), goals: parseInt(sd.goals || 0), penalties: parseInt(sd.penalties || 0) };
  });

  parsed.sort((a, b) => b.goals - a.goals || a.rank - b.rank);

  const homeLow = (homeName || '').toLowerCase();
  const awayLow = (awayName || '').toLowerCase();

  const rows = parsed.slice(0, 15).map((p, i) => {
    const teamLow  = p.teamName.toLowerCase();
    const isHome   = homeLow && teamLow.includes(homeLow.substring(0, 4));
    const isAway   = awayLow && teamLow.includes(awayLow.substring(0, 4));
    const cls      = isHome ? ' class="lt-home"' : isAway ? ' class="lt-away"' : '';
    const penBadge = p.penalties > 0 ? ` <span class="ts-pen">(${p.penalties}S)</span>` : '';
    return `<tr${cls}><td>${i + 1}</td><td class="lt-name">${p.name}${penBadge}</td><td class="lt-name ts-team">${p.teamName}</td><td>${p.goals}</td></tr>`;
  }).join('');

  return `<table class="league-table">
    <thead><tr><th>#</th><th class="lt-name">Spiller</th><th class="lt-name ts-team">Hold</th><th>M</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderH2H(data, homeName, awayName) {
  const events = data?.events || {};
  const evList = Object.values(events).filter(ev => ev.id);
  if (!evList.length) return '<div class="pm-empty">Ingen H2H-kampe fundet</div>';

  const homeLow = (homeName || '').toLowerCase().substring(0, 5);
  const awayLow = (awayName || '').toLowerCase().substring(0, 5);
  let homeWins = 0, awayWins = 0, draws = 0;

  function scoreFromPart(part) {
    if (!part?.result) return null;
    const entries = Object.values(part.result);
    const ot = entries.find(r => r.result_code === 'ordinarytime');
    const val = parseInt(ot?.value ?? entries[0]?.value ?? '');
    return isNaN(val) ? null : val;
  }

  const rows = evList.slice(0, 5).map(ev => {
    const parts    = ev.event_participants ? Object.values(ev.event_participants) : [];
    const homePart = parts.find(p => String(p.number) === '1') || parts[0] || {};
    const awayPart = parts.find(p => String(p.number) === '2') || parts[1] || {};
    const hName    = homePart.participant?.name || homePart.name || '?';
    const aName    = awayPart.participant?.name || awayPart.name || '?';
    const hGoals   = scoreFromPart(homePart);
    const aGoals   = scoreFromPart(awayPart);

    // Date
    const startdate = ev.startdate || '';
    let dateStr = '';
    if (startdate) {
      try {
        const iso = startdate.includes('T') ? startdate : startdate.replace(' ', 'T');
        const d   = new Date(/[Z+]/.test(iso) ? iso : iso + 'Z');
        dateStr   = d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Copenhagen' });
      } catch { dateStr = startdate.substring(0, 10); }
    }

    // Win tracking — figure out which side is "our" home team
    const hNameLow = hName.toLowerCase();
    const hIsCurrentHome = homeLow && hNameLow.includes(homeLow);
    if (hGoals !== null && aGoals !== null) {
      if (hGoals > aGoals)      { hIsCurrentHome ? homeWins++ : awayWins++; }
      else if (aGoals > hGoals) { hIsCurrentHome ? awayWins++ : homeWins++; }
      else                      { draws++; }
    }

    const hCls = homeLow && hNameLow.includes(homeLow) ? 'h2h-home' : (awayLow && hNameLow.includes(awayLow) ? 'h2h-away' : '');
    const aNameLow = aName.toLowerCase();
    const aCls = awayLow && aNameLow.includes(awayLow) ? 'h2h-away' : (homeLow && aNameLow.includes(homeLow) ? 'h2h-home' : '');
    const scoreStr = hGoals !== null && aGoals !== null ? `${hGoals} – ${aGoals}` : '— – —';

    return `<tr>
      <td class="h2h-date">${dateStr}</td>
      <td class="h2h-team h2h-right ${hCls}">${hName}</td>
      <td class="h2h-score">${scoreStr}</td>
      <td class="h2h-team ${aCls}">${aName}</td>
    </tr>`;
  }).join('');

  const summary = `<div class="h2h-summary">
    <span class="h2h-sum-home">${homeName || 'Hjemme'}: ${homeWins}</span>
    <span class="h2h-sum-draw">Uafgjort: ${draws}</span>
    <span class="h2h-sum-away">${awayName || 'Ude'}: ${awayWins}</span>
  </div>`;

  return `<table class="h2h-table"><tbody>${rows}</tbody></table>${summary}`;
}

function renderLineup(lineup, homeName, awayName, matchId, homeFK, awayFK) {
  if (!lineup) return '';
  const home = lineup.home || [];
  const away = lineup.away || [];
  if (!home.length && !away.length) return '';

  function side(players, label, sidePartFK) {
    const starters = players.filter(p => p.starter);
    const subs     = players.filter(p => !p.starter);
    if (!starters.length && !subs.length) return '';
    return `
      <div class="lu-side">
        <div class="lu-side-title">${label}</div>
        ${starters.map(p => `<div class="lu-player"><span class="lu-shirt">${p.shirt}</span>${p.pos ? `<span class="lu-pos">${p.pos}</span>` : ''}<span class="lu-name${p.id ? ' lu-clickable' : ''}" data-pid="${p.id || ''}" data-pname="${esc(p.name)}" data-tpfk="${sidePartFK || ''}">${esc(p.name)}</span></div>`).join('')}
        ${subs.length ? `<div class="lu-sub-divider">Reserver</div>` + subs.map(p => `<div class="lu-player lu-sub"><span class="lu-shirt">${p.shirt}</span><span class="lu-name${p.id ? ' lu-clickable' : ''}" data-pid="${p.id || ''}" data-pname="${esc(p.name)}" data-tpfk="${sidePartFK || ''}">${esc(p.name)}</span></div>`).join('') : ''}
      </div>`;
  }

  const open    = liveExpandedLineup.has(String(matchId));
  const mode    = livePitchMode.get(String(matchId)) || 'liste';
  const isOnAir = String(lineupOnAirMatchId) === String(matchId);
  return `
    <button class="live-lineup-toggle" data-id="${matchId}">OPSTILLING ${open ? '▴' : '▾'}</button>
    <div class="live-lineup-wrap" style="display:${open ? 'block' : 'none'}">
      <div class="lineup-tabs">
        <button class="lu-tab${mode === 'liste' ? ' active' : ''}" data-mode="liste" data-id="${matchId}">LISTE</button>
        <button class="lu-tab${mode === 'bane' ? ' active' : ''}" data-mode="bane" data-id="${matchId}">BANE</button>
      </div>
      <div class="live-lineup" style="display:${mode === 'liste' ? 'flex' : 'none'}">${side(home, homeName || 'Hjemme', homeFK)}${side(away, awayName || 'Ude', awayFK)}</div>
      <div class="pitch-wrap" style="display:${mode === 'bane' ? 'flex' : 'none'}">
        ${renderPitch(lineup, homeName, awayName, homeFK, awayFK)}
      </div>
      <div class="lineup-onair-bar" data-id="${matchId}">
        <button class="lu-home-btn" data-id="${matchId}">⬤ HJEMMEHOLD</button>
        <button class="lu-away-btn" data-id="${matchId}">⬤ UDEHOLD</button>
        <button class="lu-offair-btn" data-id="${matchId}" style="${!isOnAir ? 'display:none' : ''}">■ TAG AF</button>
        <span class="lu-onair-badge" style="${!isOnAir ? 'display:none' : ''}"><span class="lu-onair-dot"></span>LIVE</span>
        <button class="lu-preview-btn" data-id="${matchId}" style="margin-left:auto">▶ PREVIEW</button>
        <button class="lu-vmix-btn" data-id="${matchId}">⧉ vMix URL</button>
      </div>
    </div>`;
}

// ── OPSTILLING ON AIR ─────────────────────────────────────────

function buildLineupPayload(m) {
  if (!m?.lineup) return null;
  const cardsByPlayer = {};
  for (const ev of (m.events || [])) {
    if (ev.type !== 'Card') continue;
    const n = ev.player;
    if (!cardsByPlayer[n]) cardsByPlayer[n] = { yellow: 0, red: false };
    if (ev.detail === 'Yellow Card') cardsByPlayer[n].yellow++;
    else cardsByPlayer[n].red = true;
  }
  function formation(players) {
    const st = players.filter(p => p.starter);
    const lines = {};
    for (const p of st) {
      const rp = p.rawPos || 0;
      const z = rp <= 0 ? p.pos : rp <= 20 ? 'MV' : rp <= 60 ? 'FB' : rp <= 82 ? 'MF' : rp <= 100 ? 'AMF' : 'A';
      if (z === 'MV') continue;
      lines[z] = (lines[z] || 0) + 1;
    }
    return ['FB','MF','AMF','A'].map(z => lines[z]).filter(Boolean).join('-');
  }
  function mapPlayers(players) {
    return (players || []).map(p => {
      const c = cardsByPlayer[p.name] || {};
      return {
        id:          p.id || '',
        shirt:       p.shirt,
        name:        p.name,
        pos:         p.pos || '',
        rawPos:      p.rawPos  || 0,
        enetPos:     p.enetPos || 99,
        starter:     !!p.starter,
        yellowCards: c.yellow || 0,
        redCard:     c.red    || false
      };
    });
  }
  return {
    home: {
      name:      m.home  || '',
      partFK:    m.home_part_fk || '',
      formation: formation(m.lineup.home || []),
      players:   mapPlayers(m.lineup.home)
    },
    away: {
      name:      m.away  || '',
      partFK:    m.away_part_fk || '',
      formation: formation(m.lineup.away || []),
      players:   mapPlayers(m.lineup.away)
    }
  };
}

async function sendLineupSide(matchId, side) {
  const m = liveMatchData.get(String(matchId));
  if (!m) return;
  const payload = buildLineupPayload(m);
  if (!payload) return;
  try {
    // Gem data per kamp-slot så companion-links kan hente det
    const slotIdx = kampe.findIndex(k => String(k.enetpulseId) === String(matchId));
    if (slotIdx >= 0) {
      const slot = String(slotIdx + 1);
      if (!lineupSlots[slot]) lineupSlots[slot] = {};
      lineupSlots[slot][side] = payload;
      await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lineup_slots', value: JSON.stringify(lineupSlots) });
    }
    await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lineup_data',    value: JSON.stringify(payload) });
    await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lineup_trigger', value: side });
    lineupOnAirMatchId = String(matchId);
    updateLineupOnAirBars();
    toast('Opstilling (' + (side === 'home' ? 'Hjemme' : 'Ude') + ') on air ✓', 'ok');
  } catch { toast('Fejl ved send on air', 'err'); }
}

async function sendLineupOff() {
  try {
    await sbUpsert('settings', { projekt_id: aktivProjektId, key: 'lineup_trigger', value: 'out' });
    lineupOnAirMatchId = null;
    updateLineupOnAirBars();
    toast('Opstilling taget af ✓', 'ok');
  } catch { toast('Fejl ved tag af', 'err'); }
}

function updateLineupOnAirBars() {
  document.querySelectorAll('.lineup-onair-bar').forEach(bar => {
    const isOnAir = String(lineupOnAirMatchId) === String(bar.dataset.id);
    bar.querySelector('.lu-offair-btn').style.display  = isOnAir ? '' : 'none';
    bar.querySelector('.lu-onair-badge').style.display = isOnAir ? '' : 'none';
  });
}

// ── SPILLER-MODAL ─────────────────────────────────────────────

const playerModal    = document.getElementById('playerModal');
const playerModalClose = document.getElementById('playerModalClose');
const playerModalContent = document.getElementById('playerModalContent');

playerModalClose?.addEventListener('click', () => { playerModal.style.display = 'none'; });
playerModal?.addEventListener('click', e => { if (e.target === playerModal) playerModal.style.display = 'none'; });
document.getElementById('liveGrid')?.addEventListener('click', ev => {
  const el = ev.target.closest('.lu-clickable');
  if (el && el.dataset.pid) {
    const card = el.closest('.live-card');
    const tfk  = card?.dataset.tfk || '';
    const mid  = card?.dataset.mid || '';
    openPlayerModal(el.dataset.pid, el.dataset.pname, tfk, mid, el.dataset.tpfk || '');
  }
});

function playerField(label, value) {
  if (!value && value !== 0) return '';
  return `<div class="pm-row"><span class="pm-label">${label}</span><span class="pm-value">${value}</span></div>`;
}

function calcAge(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d)) return dob;
  const age = Math.floor((Date.now() - d) / (365.25 * 24 * 3600 * 1000));
  return `${d.toLocaleDateString('da-DK')} (${age} år)`;
}

function extractMatchRating(ratingJson, playerId) {
  if (!ratingJson?.ok) return null;
  const data  = ratingJson.data;
  const stats = data?.statistics || data?.statistic || {};
  for (const stat of Object.values(stats)) {
    const parts = stat.statistic_participants || {};
    for (const part of Object.values(parts)) {
      if (String(part.participantFK) === String(playerId)) {
        const sd  = {};
        const arr = Array.isArray(part.statistic_data) ? part.statistic_data : Object.values(part.statistic_data || {});
        arr.forEach(d => { if (d.code) sd[d.code] = d.value; });
        return sd;
      }
    }
  }
  return null;
}

function renderPlayerData(p, statsJson, playerId, ratingJson, teamPartFK) {
  if (!p || typeof p !== 'object') return '<div class="pm-empty">Ingen data</div>';

  // Parse enetpulse property-array: [{name, value}, ...] → flat map
  const props = {};
  if (p.property) {
    const items = Array.isArray(p.property) ? p.property : Object.values(p.property);
    for (const item of items) {
      if (item.name && item.value != null) props[item.name] = item.value;
    }
  }

  const name        = p.name || p.fullname || '';
  const nationality = p.country_name || p.nationality || '';
  const dob         = props.date_of_birth || p.birthdate || p.date_of_birth || '';
  const position    = props.position || p.position || '';
  const specPos     = props.specific_position || '';
  const secPos      = props.secondary_position_1 || '';
  const status      = props.status || '';
  const heightVal   = props.height || p.height || '';
  const weightVal   = props.weight || p.weight || '';
  const foot        = props.foot || p.foot || '';

  // Resterende property-felter der ikke er vist ovenfor
  const knownProps = new Set(['date_of_birth','position','specific_position','secondary_position_1','status','height','weight','foot']);
  const extraProps = Object.entries(props).filter(([k]) => !knownProps.has(k));

  // Resterende top-level felter (skjul interne / allerede viste)
  const knownTop = new Set(['name','fullname','short_name','country_name','nationality','countryFK',
    'type','n','ut','property','id','participantFK','gender','active','retirement_date',
    'birthdate','date_of_birth','position','height','weight','foot']);
  const extraTop = Object.entries(p).filter(([k, v]) => !knownTop.has(k) && v !== null && v !== '' && typeof v !== 'object');

  // Kampvurdering (live rating for denne kamp)
  let matchRatingHtml = '';
  const rd = extractMatchRating(ratingJson, playerId);
  if (rd && Object.keys(rd).length) {
    const rating = rd.rating || rd.Rating || rd.player_rating;
    const RATING_LABELS = {
      rating:               null, // vises som badge
      Rating:               null,
      player_rating:        null,
      shots_on_goal:        'Skud på mål',
      shots_off_goal:       'Skud udenfor',
      passes:               'Afleveringer',
      pass_accuracy:        'Aflevering %',
      tackles:              'Tacklinger',
      duel_won:             'Dueller vundet',
      duel_lost:            'Dueller tabt',
      aerial_won:           'Luftdueller vundet',
      aerial_lost:          'Luftdueller tabt',
      fouls:                'Frispark begået',
      saves:                'Redninger',
    };
    const ratingBadge = rating != null
      ? `<div class="pm-rating-badge">${parseFloat(rating).toFixed(1)}</div>`
      : '';
    const ratingRows = Object.entries(RATING_LABELS)
      .filter(([k, label]) => label && rd[k] != null)
      .map(([k, label]) => `<div class="pm-stat-row"><span class="pm-stat-label">${label}</span><span class="pm-stat-value">${rd[k]}</span></div>`)
      .join('');
    if (ratingBadge || ratingRows) {
      matchRatingHtml = `<div class="pm-section-title">Kampvurdering${ratingBadge}</div><div class="pm-section">${ratingRows}</div>`;
    }
  }

  // Sæsonstatistik fra participant_stats
  let seasonStatsHtml = '';
  const statsStandings = statsJson?.ok && (statsJson.data?.standings || statsJson.data?.standing);
  if (statsStandings) {
    const standingEntry = Object.values(statsStandings)[0];
    const participants  = standingEntry?.standing_participants || {};
    const allParts = Object.values(participants);
    const partEntry = playerId
      ? allParts.find(p => String(p.participantFK) === String(playerId)) || allParts[0]
      : allParts[0];
    if (partEntry?.standing_data) {
      const sd = {};
      const arr = Array.isArray(partEntry.standing_data) ? partEntry.standing_data : Object.values(partEntry.standing_data);
      arr.forEach(d => { if (d.code) sd[d.code] = d.value; });
      const LABELS = {
        played:      'Kampe',
        min:         'Minutter',
        goals:       'Mål',
        assists:     'Assists',
        ycards:      'Gule kort',
        rcards:      'Røde kort',
        cleansheets: 'Clean sheets',
        conceded:    'Indkasserede mål',
      };
      const rows = Object.entries(LABELS)
        .filter(([k]) => sd[k] != null)
        .map(([k, label]) => `<div class="pm-stat-row"><span class="pm-stat-label">${label}</span><span class="pm-stat-value">${sd[k]}</span></div>`)
        .join('');
      if (rows) seasonStatsHtml = `<div class="pm-section-title">Sæsonstatistik</div><div class="pm-section">${rows}</div>`;
    }
  }

  const photoHtml = teamPartFK && playerId
    ? `<img class="pm-photo" src="https://driu3sl4x7vty.cloudfront.net/spdk/current/524x584/${teamPartFK}/${playerId}.png" alt="">`
    : '';

  return `
    ${photoHtml}
    <div class="pm-name">${name || '—'}</div>
    <div class="pm-section">
      ${playerField('Nationalitet', nationality)}
      ${playerField('Fødselsdato', calcAge(dob))}
      ${playerField('Position', position)}
      ${specPos ? playerField('Specifik position', specPos) : ''}
      ${secPos && secPos !== specPos ? playerField('Alternativ position', secPos) : ''}
      ${foot ? playerField('Fod', foot) : ''}
      ${heightVal ? playerField('Højde', heightVal + ' cm') : ''}
      ${weightVal ? playerField('Vægt', weightVal + ' kg') : ''}
      ${status ? playerField('Status', status) : ''}
    </div>
    ${extraProps.length || extraTop.length ? `
    <div class="pm-section-title">Øvrige data</div>
    <div class="pm-section">
      ${extraProps.map(([k, v]) => playerField(k, v)).join('')}
      ${extraTop.map(([k, v]) => playerField(k, v)).join('')}
    </div>` : ''}
    ${matchRatingHtml}
    ${seasonStatsHtml}`;
}

async function openPlayerModal(id, name, tournamentFk, matchId, teamPartFK) {
  playerModalContent.innerHTML = `<div class="pm-name">${name || '…'}</div><div class="pm-loading">Henter data…</div>`;
  playerModal.style.display = 'flex';

  try {
    const fetches = [apiFetch(`/api/player?id=${encodeURIComponent(id)}`)];
    if (tournamentFk) fetches.push(apiFetch(`/api/standings?type=participant_stats&object=tournament_stage&objectFK=${encodeURIComponent(tournamentFk)}`));
    if (matchId)      fetches.push(apiFetch(`/api/standings?type=player_ratings&object=event&objectFK=${encodeURIComponent(matchId)}`));
    const results = await Promise.all(fetches);
    const profileJson = await results[0].json();
    let statsJson  = null;
    let ratingJson = null;
    if (results[1]) { try { statsJson  = await results[1].json(); } catch {} }
    if (results[2]) { try { ratingJson = await results[2].json(); } catch {} }

    if (profileJson.error) {
      playerModalContent.innerHTML = `<div class="pm-name">${name}</div><div class="pm-empty">${profileJson.error}</div>`;
    } else {
      playerModalContent.innerHTML = renderPlayerData(profileJson.raw, statsJson, id, ratingJson, teamPartFK);
    }
  } catch (err) {
    playerModalContent.innerHTML = `<div class="pm-name">${name}</div><div class="pm-empty">Netværksfejl</div>`;
  }
}

