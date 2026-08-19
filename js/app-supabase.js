// ── SUPABASE HELPERS ──────────────────────────────────────────
// SB_HEADERS og sbHeaders() kommer fra js/auth.js
const SB_HEADERS = sbHeaders();
const SB_HEADERS_MINIMAL = { ...SB_HEADERS, 'Prefer': 'return=minimal' };

// ── EGNE API-ENDPOINTS — kræver login ─────────────────────────
// Datakilde-endpoints (/api/enetpulse m.fl.) afviser kald uden gyldig login-token.
let _companionToken = ''; // trigger-token til de viste Companion-URLs (hentes efter login)

async function apiFetch(url, opts = {}) {
  const session = await getSession();
  const headers = { ...(opts.headers || {}) };
  if (session) headers['Authorization'] = 'Bearer ' + session.access_token;
  return fetch(url, { ...opts, headers });
}

async function loadCompanionToken() {
  if (_companionToken) return;
  try {
    const r = await apiFetch('/api/trigger-token');
    if (r.ok) _companionToken = (await r.json()).token || '';
  } catch { /* URLs vises uden token — serveren afviser dem alligevel */ }
}

const BROADCAST_TRIGGER_KEYS = new Set([
  'ticker_ovl_trigger','breaking_trigger','score_breaking_trigger','score_trigger',
  'live_boks_trigger','lt_trigger','lt_slot','LIVE_bund',
  'lineup_trigger','credits_trigger',
  'Komm_score_K-1','Komm_score_K-2','Komm_score_K-3',
  'Komm_score_K-4','Komm_score_K-5','Komm_score_K-6',
]);

let _bcChannel   = null;
let _bcProjektId = null;

function _ensureBcChannel(pid) {
  if (_bcChannel && _bcProjektId === pid) return;
  if (_bcChannel) _bcChannel.unsubscribe();
  const _sbRt = window.supabase.createClient(SB_URL, SB_ANON);
  _bcChannel = _sbRt.channel('triggers-' + pid);
  _bcChannel.subscribe();
  _bcProjektId = pid;
}

function sbBroadcast(key, value, extra) {
  if (!aktivProjektId) return;
  try {
    _ensureBcChannel(aktivProjektId);
    _bcChannel.send({ type: 'broadcast', event: 'trigger',
      payload: { key, value, projekt_id: aktivProjektId, ...(extra || {}) } });
  } catch { /* non-critical */ }
}

function _broadcastKampState(i, statusShort, statusElapsed) {
  const k = kampe[i];
  if (!k || !aktivProjektId) return;
  try {
    _ensureBcChannel(aktivProjektId);
    _bcChannel.send({ type: 'broadcast', event: 'kamp', payload: {
      slot:           i + 1,
      projekt_id:     aktivProjektId,
      hold1_kort:     k.hold1Kort,
      hold2_kort:     k.hold2Kort,
      hold1_score:    k.hold1Score,
      hold2_score:    k.hold2Score,
      kommentator:    k.kommentator,
      lokation:       k.lokation,
      on_air:         k.onAir,
      status_short:   statusShort  ?? null,
      status_elapsed: statusElapsed ?? null
    }});
  } catch { /* non-critical */ }
}
if (aktivProjektId) _ensureBcChannel(aktivProjektId);

async function sbGet(path) {
  const res = await fetch(SB_URL + '/rest/v1/' + path, { headers: SB_HEADERS });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(SB_URL + '/rest/v1/' + path, {
    method: 'PATCH', headers: SB_HEADERS_MINIMAL, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

async function sbUpsert(table, body) {
  if (table === 'settings' && body.key && BROADCAST_TRIGGER_KEYS.has(body.key))
    sbBroadcast(body.key, body.value, body.slot ? { slot: body.slot } : undefined);
  const { slot: _bcSlot, ...sbBody } = body;
  const res = await fetch(SB_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: { ...SB_HEADERS_MINIMAL, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(sbBody)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

async function sbDelete(path) {
  const res = await fetch(SB_URL + '/rest/v1/' + path, {
    method: 'DELETE', headers: SB_HEADERS_MINIMAL
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

async function sbPost(path, body) {
  const res = await fetch(SB_URL + '/rest/v1/' + path, {
    method: 'POST', headers: SB_HEADERS_MINIMAL, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}

// ── FETCH ALL DATA ────────────────────────────────────────────
async function fetchAll() {
  const pid = aktivProjektId;
  const [dropdownsRaw, kampeRaw, subsRaw, vmixCallsRaw, tickersRaw, settingsRaw, creditsRaw] =
    await Promise.all([
      sbGet('dropdowns?select=*&order=orden.asc'),
      sbGet('kampe?select=*&projekt_id=eq.' + pid + '&order=slot.asc'),
      sbGet('subs?select=*&projekt_id=eq.' + pid + '&order=slot.asc'),
      sbGet('vmix_calls?select=*&projekt_id=eq.' + pid + '&order=slot.asc'),
      sbGet('tickers?select=*&projekt_id=eq.' + pid + '&order=slot.asc'),
      sbGet('settings?select=*&projekt_id=eq.' + pid),
      sbGet('credits?select=*&projekt_id=eq.' + pid)
    ]);

  const speedRow     = settingsRaw.find(r => r.key === 'credits_speed');
  const speed        = speedRow ? parseFloat(speedRow.value) : 30;
  const activeSubRow = settingsRaw.find(r => r.key === 'active_sub');
  activeSubSlot      = activeSubRow ? parseInt(activeSubRow.value) || 0 : 0;

  return {
    dropdowns: {
      kommentatorer: dropdownsRaw.filter(r => r.type === 'kommentator').map(r => ({ lang: r.lang, titel: r.titel || '' })).sort((a, b) => a.lang.localeCompare(b.lang, 'da')),
      lokationer:    dropdownsRaw.filter(r => r.type === 'lokation').map(r => r.lang).sort((a, b) => a.localeCompare(b, 'da')),
      holds:         dropdownsRaw.filter(r => r.type === 'hold').map(r => ({ lang: r.lang, kort: r.kort, enetNavn: r.enet_navn || null })).sort((a, b) => a.lang.localeCompare(b.lang, 'da'))
    },
    kampe: kampeRaw.map(r => ({
      hold1Lang:   r.hold1_lang   || '',
      hold1Kort:   r.hold1_kort   || '',
      hold1Score:  r.hold1_score  || 0,
      hold2Score:  r.hold2_score  || 0,
      hold2Kort:   r.hold2_kort   || '',
      hold2Lang:   r.hold2_lang   || '',
      kommentator: r.kommentator  || '',
      lokation:    r.lokation     || '',
      vmixcall:    r.vmixcall     || '',
      onAir:       r.on_air       || false,
      fixtureId:   r.fixture_id   || null,
      enetpulseId: r.enetpulse_id || null
    })),
    subs: {
      subs:      subsRaw.map(r => ({ navn: r.navn || '', titel: r.titel || '' })),
      vmixCalls: vmixCallsRaw.map(r => ({ navn: r.navn || '', titel: r.titel || '', link: r.link || '' }))
    },
    tickers: tickersRaw.map(r => ({
      overskrift: r.overskrift || '',
      tekst:      r.tekst      || '',
      onAir:      r.on_air     || false,
      breaking:   r.breaking   || false
    })),
    credits: {
      items: creditsRaw.map(r => ({
        row:    r.id,
        side:   r.side,
        orden:  r.orden,
        titel:  r.titel || '',
        navne:  r.navne || ''
      })),
      speed
    }
  };
}

