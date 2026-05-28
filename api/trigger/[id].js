import { SB_URL, SB_ANON, SB_SERVICE_ROLE } from '../_supabase.js';

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

const HEADERS = {
  'apikey': SB_ANON,
  'Authorization': 'Bearer ' + SB_ANON,
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

async function runStep(pid, h, slotOverride) {
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
        ...kommKeys.map(k => sbBroadcastRest(pid, k, 'out')),
        ...kommKeys.map(k => upsert(pid, k, 'out')),
      ]);
    } else {
      const kampeRows = await sbGet(`kampe?projekt_id=eq.${encodeURIComponent(pid)}&on_air=eq.true&select=slot`);
      const activeSlots = kampeRows.map(r => r.slot).filter(s => s >= 1 && s <= 6);
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
  await Promise.all([sbBroadcastRest(pid, h.key, h.value), upsert(pid, h.key, h.value)]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'projekt id mangler' });

  const macroId      = req.query.macro;
  const slotOverride = req.query.slot || '';
  if (macroId) {
    try {
      const rows = await sbGet(`projekt_makroer?id=eq.${encodeURIComponent(macroId)}&projekt_id=eq.${encodeURIComponent(id)}&limit=1`);
      const macro = rows[0];
      if (!macro) return res.status(404).json({ error: 'Makro ikke fundet' });
      // Group consecutive non-wait steps into batches; each batch runs in parallel
      const segments = [];
      let batch = [];
      for (const h of macro.handlinger || []) {
        if (h.key === 'wait') {
          if (batch.length) { segments.push({ type: 'batch', steps: batch }); batch = []; }
          segments.push({ type: 'wait', ms: Math.round(parseFloat(h.value || '0') * 1000) });
        } else {
          batch.push(h);
        }
      }
      if (batch.length) segments.push({ type: 'batch', steps: batch });
      for (const seg of segments) {
        if (seg.type === 'wait') { await new Promise(r => setTimeout(r, seg.ms)); continue; }
        await Promise.all(seg.steps.map(h => runStep(id, h, slotOverride)));
      }
      return res.status(200).json({ ok: true, fired: (macro.handlinger || []).length });
    } catch (err) {
      return res.status(502).json({ error: String(err.message) });
    }
  }

  const key   = req.query.key   || '';
  const value = req.query.value || '';
  const slot  = req.query.slot  || '';

  if (!ALLOWED_KEYS.includes(key)) return res.status(400).json({ error: 'Ukendt key: ' + key });
  if (!value) return res.status(400).json({ error: 'value mangler' });

  try {
    if (key === 'komm_alle') {
      const allKeys = ['Komm_score_K-1','Komm_score_K-2','Komm_score_K-3',
                       'Komm_score_K-4','Komm_score_K-5','Komm_score_K-6'];
      if (value === 'out') {
        await Promise.all([
          ...allKeys.map(k => sbBroadcastRest(id, k, 'out')),
          ...allKeys.map(k => upsert(id, k, 'out')),
        ]);
        return res.status(200).json({ ok: true, key, value, count: allKeys.length });
      }
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
    const [bc] = await Promise.all([sbBroadcastRest(id, key, value), upsert(id, key, value)]);
    res.status(200).json({ ok: true, key, value, slot: slot || undefined, _bc: bc });
  } catch (err) {
    res.status(502).json({ error: String(err.message) });
  }
}
