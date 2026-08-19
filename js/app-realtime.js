// ── REALTIME ──────────────────────────────────────────────────
// sbClient defineret i js/auth.js

function applyKampRow(row) {
  if (row.projekt_id !== aktivProjektId) return;
  const i = row.slot - 1;
  if (i < 0 || i > 5) return;
  if (kampe[i].editMode || kampe[i].savePending) return;
  const prev = kampe[i];
  const data = {
    hold1Lang:   row.hold1_lang   || '', hold1Kort: row.hold1_kort || '',
    hold1Score:  row.hold1_score  || 0,  hold2Score: row.hold2_score || 0,
    hold2Kort:   row.hold2_kort   || '', hold2Lang: row.hold2_lang || '',
    kommentator: row.kommentator  || '', lokation: row.lokation || '',
    vmixcall:    row.vmixcall     || '', onAir: row.on_air === true,
    enetpulseId: row.enetpulse_id || null
  };
  const merged = { ...prev, ...data, editMode: false, collapsed: prev.collapsed, buf: prev.buf };
  if (prev.onAirPending) merged.onAir = prev.onAir;
  if (!data.enetpulseId && prev.enetpulseId) {
    merged.hold1PartFk = null;
    merged.hold2PartFk = null;
    merged.starttime = '';
  }
  const enetChanged = prev.enetpulseId !== data.enetpulseId;
  kampe[i] = merged;
  // Auto-trigger komm-boks IN kun hvis brugeren aktivt har trykket PÅ (_kommPaaMode)
  if (data.onAir && !prev.onAir) {
    const newBoks = KOMM_BOKSE.find(k => k.slot === row.slot);
    if (_kommPaaMode && newBoks && (grafiktState[newBoks.triggerKey] || 'out') === 'out') {
      setGrafiktTrigger(newBoks.triggerKey, 'in');
    }
  } else if (!data.onAir && prev.onAir) {
    const boks = KOMM_BOKSE.find(k => k.slot === row.slot);
    if (boks && (grafiktState[boks.triggerKey] || 'out') !== 'out') {
      setGrafiktTrigger(boks.triggerKey, 'out');
    }
  }
  rerender(i);
  if (enetChanged) fetchLiveMatches();
}

function applySubRow(row) {
  if (row.projekt_id !== aktivProjektId) return;
  const i = row.slot - 1;
  if (i < 0 || i > 14) return;
  if (subs[i].editMode || subs[i].savePending) return;
  subs[i] = { ...subs[i], navn: row.navn || '', titel: row.titel || '' };
  rerenderSub(i);
  if (document.getElementById('tab-grafik')?.classList.contains('active')) _debouncedRenderGrafik();
}

function applyVmixCallRow(row) {
  if (row.projekt_id !== aktivProjektId) return;
  const i = row.slot - 1;
  if (i < 0 || i > 7) return;
  if (vmixCalls[i].editMode || vmixCalls[i].savePending) return;
  vmixCalls[i] = { ...vmixCalls[i], navn: row.navn || '', titel: row.titel || '', link: row.link || '' };
  rerenderVmixCall(i);
  if (document.getElementById('tab-grafik')?.classList.contains('active')) _debouncedRenderGrafik();
}

function applyTickerRow(row) {
  if (row.projekt_id !== aktivProjektId) return;
  const i = row.slot - 1;
  if (i < 0 || i > 19) return;
  if (tickers[i].editMode || tickers[i].savePending) return;
  const prev = tickers[i];
  const merged = { ...prev, overskrift: row.overskrift || '', tekst: row.tekst || '',
    onAir: row.on_air === true, breaking: row.breaking === true };
  if (prev.onAirPending)    merged.onAir    = prev.onAir;
  if (prev.breakingPending) merged.breaking = prev.breaking;
  tickers[i] = merged;
  rerenderTicker(i);
}

sbClient.channel('db-changes')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kampe' },
      p => applyKampRow(p.new))
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'subs' },
      p => applySubRow(p.new))
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vmix_calls' },
      p => applyVmixCallRow(p.new))
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickers' },
      p => applyTickerRow(p.new))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'credits' },
      () => refreshCredits())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' },
      p => {
        if (!p.new) return; // DELETE – ignorer
        if (p.new.key === 'credits_trigger') {
          creditsTriggerActive = p.new.value === 'in';
          updateCreditsSendBtn();
        } else if (p.new.key === 'lineup_trigger') {
          if (p.new.value === 'out') { lineupOnAirMatchId = null; updateLineupOnAirBars(); }
        } else if (p.new.key === 'active_sub') {
          activeSubSlot = parseInt(p.new.value) || 0;
          subs.forEach((_, i) => rerenderSub(i));
        } else if (p.new.key === 'overlay_lag_order') {
          const raw = p.new.value || '';
          overlayLagOrder = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [...DEFAULT_LAG_ORDER];
          if (document.getElementById('tab-grafik')?.classList.contains('active')) _debouncedRenderGrafik();
        } else if (p.new.key === 'ticker_lag_order') {
          const raw = p.new.value || '';
          tickerLagOrder = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [...DEFAULT_TICKER_SUB_ORDER];
          DEFAULT_TICKER_SUB_ORDER.forEach(id => { if (!tickerLagOrder.includes(id)) tickerLagOrder.push(id); });
          if (document.getElementById('tab-grafik')?.classList.contains('active')) _debouncedRenderGrafik();
        } else if (p.new.key === 'credits_speed') {
          refreshCredits();
        }
        // Opdater grafik-tab hvis det er åbent og en trigger-key, lt_slot eller score_breaking_trigger ændrer sig
        if (OVERLAY_GRAPHICS.some(g => g.triggerKey === p.new.key) || p.new.key === 'lt_slot' || p.new.key === 'score_breaking_trigger' || customGrafik.some(g => g.trigger_key === p.new.key) || KOMM_BOKSE.some(k => k.triggerKey === p.new.key) || BROADCAST_TRIGGER_KEYS.has(p.new.key)) {
          grafiktState[p.new.key] = p.new.value;
          if (document.getElementById('tab-grafik')?.classList.contains('active')) _debouncedRenderGrafik();
          if (document.getElementById('tab-grafik-ops')?.classList.contains('active')) _debouncedRenderGrafikOps();
        }
      })
  .subscribe();

