import { SB_URL, SB_ANON, SB_SERVICE_ROLE } from '../_supabase.js';

// Vercel: hæv funktionens tidsgrænse fra Hobby-standardens 10s til 30s, så
// server-kørte makroer (fra Companion) med rimelige pauser kan nå at køre helt
// færdigt i stedet for at blive dræbt midt i kæden.
export const config = { maxDuration: 30 };

// Sikkert ventetids-budget for server-kørte makroer. Skal ligge et stykke under
// maxDuration ovenfor, så batch-kaldene (broadcast+upsert) og svaret også når at
// blive færdige inden Vercel dræber funktionen.
// BEMÆRK: hold i sync med MAKRO_MAX_WAIT_MS i js/app-grafik.js (advarsel ved gem).
const MAX_MACRO_WAIT_MS = 25000;

async function sbBroadcastRest(pid, key, value, extra) {
  const token = SB_SERVICE_ROLE || SB_ANON;
  const usingSR = !!SB_SERVICE_ROLE;
  try {
    const r = await fetch(`${SB_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'apikey': token, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: 'realtime:triggers-' + pid, event: 'broadcast',
        payload: { type: 'broadcast', event: 'trigger', payload: Object.assign({ key, value, projekt_id: pid }, extra || {}) } }] })
    });
    const body = await r.text();
    if (!r.ok) console.error('[bc] HTTP', r.status, key, body);
    return { ok: r.ok, status: r.status, sr: usingSR, body: body.slice(0, 120) };
  } catch (e) { console.error('[bc] fejl', e); return { ok: false, status: 0, sr: usingSR, body: String(e) }; }
}

const ALLOWED_KEYS = [
  'breaking_trigger',
  'ticker_ovl_trigger',
  'stilling_trigger',
  'lineup_trigger',
  'credits_trigger',
  'lt_trigger',
  'lt_slot',
  'live_boks_trigger',
  'komm_alle',
];

// DB-writes fra serveren bruger service-role, så de går uden om RLS og kan
// skrive alle settings-keys (fx lineup_data, lt_slot) — ikke kun trigger-keys.
const _SVC = SB_SERVICE_ROLE || SB_ANON;
const HEADERS = {
  'apikey': _SVC,
  'Authorization': 'Bearer ' + _SVC,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal,resolution=merge-duplicates'
};

const GET_HEADERS = { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + SB_ANON };

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: GET_HEADERS });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  return res.json();
}

async function upsert(pid, key, value) {
  const res = await fetch(`${SB_URL}/rest/v1/settings`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ projekt_id: pid, key, value })
  });
  if (!res.ok) throw new Error('Supabase fejl ' + res.status);
}

// INFO step-afvikling (Companion value=step): ét kald = næste trin (off→side1→…→ud→off), som panelets
// step-knap. Deler state med panelet via settings.info_live, så panel + Companion aldrig er ude af sync.
// DOBBELT-GATED: kun TV-projekt OG en info-kategori grafik → kampdag kan aldrig ramme den. Kaster med
// .code=400 ved gate-fejl (mappes til HTTP 400 af kalderen).
async function infoStep(pid, key, slotOverride, projType) {
  if (projType !== 'tv') { const e = new Error('step kun i TV-projekt'); e.code = 400; throw e; }
  let kat = '';
  try {
    const gr = await sbGet(`projekt_grafik?projekt_id=eq.${encodeURIComponent(pid)}&trigger_key=eq.${encodeURIComponent(key)}&limit=1&select=kategori`);
    kat = gr[0]?.kategori || '';
  } catch {}
  if (kat !== 'info') { const e = new Error('step kun for info-grafik'); e.code = 400; throw e; }

  // Nuværende live "boks.side" (delt state). Tom = info er af.
  let liveSlot = '';
  try {
    const lr = await sbGet(`settings?projekt_id=eq.${encodeURIComponent(pid)}&key=eq.info_live&limit=1&select=value`);
    liveSlot = lr[0]?.value || '';
  } catch {}
  const live = !!liveSlot;
  const [curBox, curPageRaw] = String(liveSlot).split('.');
  const curPage = parseInt(curPageRaw || '1', 10) || 1;

  // Boks: ?slot= vinder; ellers fortsæt den boks der kører (samme fallback som panelet).
  let box = String(slotOverride || '').split('.')[0];
  if (!box) box = String(curBox || '');
  if (!box) { const e = new Error('ingen boks valgt — brug ?slot=<boks>'); e.code = 400; throw e; }

  // Antal sider i boksen (fra settings.info_bokse JSON; boks N = index N-1), samme filter som panelet.
  let total = 1;
  try {
    const br = await sbGet(`settings?projekt_id=eq.${encodeURIComponent(pid)}&key=eq.info_bokse&limit=1&select=value`);
    const arr = br[0]?.value ? JSON.parse(br[0].value) : [];
    const bb = Array.isArray(arr) ? arr[parseInt(box) - 1] : null;
    const sider = (bb && Array.isArray(bb.sider) && bb.sider.length) ? bb.sider : [(bb && bb.indhold) || ''];
    total = sider.filter((s, i) => i === 0 || (s || '').trim()).length || 1;
  } catch {}

  const boxLive = live && String(curBox) === String(box);
  let val, slot;
  if (!boxLive) { val = 'in'; slot = String(box); }
  else if (curPage < total) { val = 'in'; slot = `${box}.${curPage + 1}`; }
  else { val = 'out'; slot = ''; }

  // Persistér delt state + fyr triggeren (broadcast m. slot + settings-værdi), præcis som panelet gør.
  await upsert(pid, 'info_live', val === 'in' ? slot : '');
  await Promise.all([
    sbBroadcastRest(pid, key, val, (val === 'in' && slot) ? { slot: String(slot) } : undefined),
    upsert(pid, key, val),
  ]);
  return { ok: true, key, value: val, slot: slot || undefined, box, total };
}

async function runStep(pid, h, slotOverride, projType) {
  // Info step i en makro (Companion kan pege på en step-makro i stedet for den rå key).
  if (h.value === 'step' && !ALLOWED_KEYS.includes(h.key)) {
    await infoStep(pid, h.key, slotOverride || h.slot || '', projType);
    return;
  }
  if (h.key === 'alle_af') {
    const offKeys = [
      'lt_trigger','ticker_ovl_trigger','breaking_trigger',
      'score_trigger','score_breaking_trigger','live_boks_trigger',
      'lineup_trigger','credits_trigger','LIVE_bund',
    ];
    await Promise.all([
      ...offKeys.map(k => sbBroadcastRest(pid, k, 'out')),
      ...offKeys.map(k => upsert(pid, k, 'out')),
      upsert(pid, 'lt_slot', ''),
    ]);
    return;
  }
  if (h.key === 'komm_alle') {
    const kommKeys = ['Komm_score_K-1','Komm_score_K-2','Komm_score_K-3',
                      'Komm_score_K-4','Komm_score_K-5','Komm_score_K-6'];
    if (h.value === 'out') {
      await Promise.all([
        upsert(pid, 'komm_master', 'off'), // master AF — panelet holdes i sync via realtime
        ...kommKeys.map(k => sbBroadcastRest(pid, k, 'out')),
        ...kommKeys.map(k => upsert(pid, k, 'out')),
      ]);
    } else {
      const kampeRows = await sbGet(`kampe?projekt_id=eq.${encodeURIComponent(pid)}&on_air=eq.true&select=slot`);
      const activeSlots = kampeRows.map(r => r.slot).filter(s => s >= 1 && s <= 6);
      await upsert(pid, 'komm_master', 'on'); // master PÅ, også hvis ingen kampe er on air endnu
      if (activeSlots.length) {
        await Promise.all([
          ...activeSlots.map(s => sbBroadcastRest(pid, `Komm_score_K-${s}`, 'in')),
          ...activeSlots.map(s => upsert(pid, `Komm_score_K-${s}`, 'in')),
        ]);
      }
    }
    return;
  }
  if (h.key === 'lt_trigger') {
    const raw = slotOverride || (h.value === 'vmixcall' ? 'v' + (h.slot || '') : (h.slot || ''));
    const isVmix = raw.startsWith('v');
    const slotNum = isVmix ? raw.slice(1) : raw;
    const triggerVal = isVmix ? 'vmixcall' : (raw ? 'in' : h.value);
    if (slotNum) await upsert(pid, 'lt_slot', slotNum);
    await Promise.all([
      sbBroadcastRest(pid, 'lt_trigger', triggerVal, slotNum ? { slot: slotNum } : undefined),
      upsert(pid, 'lt_trigger', triggerVal),
    ]);
    return;
  }
  if (h.key === 'lineup_trigger' && h.slot && h.value !== 'out') {
    try {
      const slotsRows = await sbGet(`settings?projekt_id=eq.${encodeURIComponent(pid)}&key=eq.lineup_slots&limit=1&select=value`);
      const slotsData = slotsRows[0]?.value ? JSON.parse(slotsRows[0].value) : {};
      const slotPayload = slotsData[h.slot]?.[h.value];
      if (slotPayload) await upsert(pid, 'lineup_data', JSON.stringify(slotPayload));
    } catch {}
  }
  // TV sub/info-grafik i makro med plads: send pladsen MED broadcast'en (info-grafik viser boksen via
  // runAnimationIN(slot)); for SUB sættes active_sub også (fallback for ældre sub-grafik). Kun CUSTOM keys
  // (ikke ALLOWED_KEYS → undgår lineup_trigger som også har slot). Kategori afgør om active_sub sættes.
  const _eff = slotOverride || h.slot || '';
  if (_eff && h.value !== 'out' && !ALLOWED_KEYS.includes(h.key)) {
    let kat = '';
    try {
      const gr = await sbGet(`projekt_grafik?projekt_id=eq.${encodeURIComponent(pid)}&trigger_key=eq.${encodeURIComponent(h.key)}&limit=1&select=kategori`);
      kat = gr[0]?.kategori || '';
    } catch {}
    if (kat === 'sub') await upsert(pid, 'active_sub', String(_eff));
    await Promise.all([sbBroadcastRest(pid, h.key, h.value, { slot: String(_eff) }), upsert(pid, h.key, h.value)]);
    return;
  }
  await Promise.all([sbBroadcastRest(pid, h.key, h.value), upsert(pid, h.key, h.value)]);
}

export default async function handler(req, res) {
  // Accepter både POST (standard) og GET (vMix-/SPX-stil, testbart i browser). Alle parametre
  // læses fra query-strengen, så GET virker uden ændringer. no-store: en trigger er en HANDLING og
  // må ALDRIG caches/gen-serveres (ellers kunne et gentryk via GET blive serveret fra cache).
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  // Token-lås: alle kald (Companion m.fl.) skal medsende ?token= der matcher
  // TRIGGER_TOKEN-miljøvariablen i Vercel. Uden env-var afvises alt (fail closed).
  const TRIGGER_TOKEN = process.env.TRIGGER_TOKEN;
  if (!TRIGGER_TOKEN) return res.status(503).json({ error: 'TRIGGER_TOKEN er ikke sat i Vercel' });
  if (req.query.token !== TRIGGER_TOKEN) return res.status(401).json({ error: 'Ugyldig eller manglende token' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'projekt id mangler' });

  // Inaktive projekter må IKKE modtage data (triggers). Fail closed. service-role
  // læser status uden om RLS, så tjekket er uafhængigt af politikker. type bruges til at
  // gate info-step (value=step) til TV-projekter — kampdag kan aldrig ramme den.
  let projType = '';
  try {
    const pr = await fetch(`${SB_URL}/rest/v1/projekter?id=eq.${encodeURIComponent(id)}&select=aktiv,type&limit=1`,
      { headers: { apikey: _SVC, Authorization: 'Bearer ' + _SVC } });
    const projRows = await pr.json();
    if (!projRows[0]) return res.status(404).json({ error: 'Projekt ikke fundet' });
    if (projRows[0].aktiv === false) return res.status(403).json({ error: 'Projektet er inaktivt — triggers afvist' });
    projType = projRows[0].type || '';
  } catch {
    return res.status(502).json({ error: 'Kunne ikke tjekke projekt-status' });
  }

  const macroId      = req.query.macro;
  const slotOverride = req.query.slot || '';
  if (macroId) {
    try {
      const rows = await sbGet(`projekt_makroer?id=eq.${encodeURIComponent(macroId)}&projekt_id=eq.${encodeURIComponent(id)}&limit=1`);
      const macro = rows[0];
      if (!macro) return res.status(404).json({ error: 'Makro ikke fundet' });
      // Pre-flight: afvis hele makroen op front hvis den samlede ventetid over-
      // stiger budgettet. Alternativet — at starte en makro vi ikke kan nå at
      // gøre færdig — ville efterlade grafik i en halv tilstand når Vercel
      // dræber funktionen. Bedre at intet fyres og operatøren får klar besked.
      const totalWaitMs = (macro.handlinger || [])
        .filter(h => h.key === 'wait')
        .reduce((sum, h) => sum + Math.max(0, (parseFloat(h.value) || 0) * 1000), 0);
      if (totalWaitMs > MAX_MACRO_WAIT_MS) {
        return res.status(400).json({
          error: `Makro for lang: ${(totalWaitMs / 1000).toFixed(1)}s ventetid overstiger grænsen på ${MAX_MACRO_WAIT_MS / 1000}s (Vercel-timeout). Del makroen op i flere Companion-knapper.`,
          tooLong: true, totalWaitMs, maxWaitMs: MAX_MACRO_WAIT_MS
        });
      }
      // Group consecutive non-wait steps into batches; each batch runs in parallel
      const segments = [];
      let batch = [];
      for (const h of macro.handlinger || []) {
        if (h.key === 'wait') {
          if (batch.length) { segments.push({ type: 'batch', steps: batch }); batch = []; }
          // Klamp hver enkelt pause defensivt (mod negative/NaN/absurde værdier)
          segments.push({ type: 'wait', ms: Math.max(0, Math.min(MAX_MACRO_WAIT_MS, Math.round((parseFloat(h.value) || 0) * 1000))) });
        } else {
          batch.push(h);
        }
      }
      if (batch.length) segments.push({ type: 'batch', steps: batch });
      for (const seg of segments) {
        if (seg.type === 'wait') { await new Promise(r => setTimeout(r, seg.ms)); continue; }
        await Promise.all(seg.steps.map(h => runStep(id, h, slotOverride, projType)));
      }
      return res.status(200).json({ ok: true, fired: (macro.handlinger || []).length });
    } catch (err) {
      return res.status(err.code || 502).json({ error: String(err.message) });
    }
  }

  const key   = req.query.key   || '';
  const value = req.query.value || '';
  const slot  = req.query.slot  || '';

  if (!ALLOWED_KEYS.includes(key)) {
    try {
      const customRows = await sbGet(`projekt_grafik?projekt_id=eq.${encodeURIComponent(id)}&trigger_key=eq.${encodeURIComponent(key)}&limit=1&select=id`);
      if (!customRows.length) return res.status(400).json({ error: 'Ukendt key: ' + key });
    } catch {
      return res.status(400).json({ error: 'Ukendt key: ' + key });
    }
  }
  if (!value) return res.status(400).json({ error: 'value mangler' });

  try {
    // INFO step-afvikling: ét Companion-kald = næste trin. Dobbelt-gated til TV + info-grafik i infoStep.
    if (value === 'step') {
      const r = await infoStep(id, key, slot, projType);
      return res.status(200).json(r);
    }
    if (key === 'komm_alle') {
      const allKeys = ['Komm_score_K-1','Komm_score_K-2','Komm_score_K-3',
                       'Komm_score_K-4','Komm_score_K-5','Komm_score_K-6'];
      if (value === 'out') {
        await Promise.all([
          upsert(id, 'komm_master', 'off'),
          ...allKeys.map(k => sbBroadcastRest(id, k, 'out')),
          ...allKeys.map(k => upsert(id, k, 'out')),
        ]);
        return res.status(200).json({ ok: true, key, value, count: allKeys.length });
      }
      await upsert(id, 'komm_master', 'on');
      const kampeRows = await sbGet(
        `kampe?projekt_id=eq.${encodeURIComponent(id)}&on_air=eq.true&select=slot`
      );
      const activeSlots = kampeRows.map(r => r.slot).filter(s => s >= 1 && s <= 6);
      if (activeSlots.length) {
        await Promise.all([
          ...activeSlots.map(s => sbBroadcastRest(id, `Komm_score_K-${s}`, 'in')),
          ...activeSlots.map(s => upsert(id, `Komm_score_K-${s}`, 'in')),
        ]);
      }
      return res.status(200).json({ ok: true, key, value, count: activeSlots.length });
    }
    if (key === 'lt_trigger') {
      if ((value === 'in' || value === 'vmixcall') && slot) await upsert(id, 'lt_slot', String(slot));
      const [bc] = await Promise.all([sbBroadcastRest(id, 'lt_trigger', value, slot ? { slot } : undefined), upsert(id, key, value)]);
      return res.status(200).json({ ok: true, key, value, slot: slot || undefined, _bc: bc });
    }
    if (key === 'lineup_trigger' && slot && value !== 'out') {
      try {
        const slotsRows = await sbGet(`settings?projekt_id=eq.${encodeURIComponent(id)}&key=eq.lineup_slots&limit=1&select=value`);
        const slotsData = slotsRows[0]?.value ? JSON.parse(slotsRows[0].value) : {};
        const slotPayload = slotsData[slot]?.[value];
        if (slotPayload) await upsert(id, 'lineup_data', JSON.stringify(slotPayload));
      } catch {}
    }
    // TV sub/info-grafik: ?slot=N på en CUSTOM trigger (ikke ALLOWED_KEYS). Send pladsen MED broadcast'en
    // (info-grafik viser boksen via runAnimationIN(slot)); for SUB sættes active_sub også (fallback + /api/vmix).
    // Kategori afgør om active_sub sættes (så info ikke forurener active_sub).
    if (slot && value !== 'out' && !ALLOWED_KEYS.includes(key)) {
      let kat = '';
      try {
        const gr = await sbGet(`projekt_grafik?projekt_id=eq.${encodeURIComponent(id)}&trigger_key=eq.${encodeURIComponent(key)}&limit=1&select=kategori`);
        kat = gr[0]?.kategori || '';
      } catch {}
      if (kat === 'sub') await upsert(id, 'active_sub', String(slot));
      const [bc] = await Promise.all([sbBroadcastRest(id, key, value, { slot: String(slot) }), upsert(id, key, value)]);
      return res.status(200).json({ ok: true, key, value, slot, _bc: bc });
    }
    const [bc] = await Promise.all([sbBroadcastRest(id, key, value), upsert(id, key, value)]);
    res.status(200).json({ ok: true, key, value, slot: slot || undefined, _bc: bc });
  } catch (err) {
    res.status(err.code || 502).json({ error: String(err.message) });
  }
}
