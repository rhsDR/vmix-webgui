import { SB_URL, SB_ANON } from '../_supabase.js';

const ALLOWED_KEYS = [
  'breaking_trigger',
  'ticker_ovl_trigger',
  'stilling_trigger',
  'lineup_trigger',
  'credits_trigger',
  'lt_trigger',
  'lt_slot',
  'live_boks_trigger',
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'projekt id mangler' });

  const macroId = req.query.macro;
  if (macroId) {
    try {
      const rows = await sbGet(`projekt_makroer?id=eq.${encodeURIComponent(macroId)}&projekt_id=eq.${encodeURIComponent(id)}&limit=1`);
      const macro = rows[0];
      if (!macro) return res.status(404).json({ error: 'Makro ikke fundet' });
      for (const h of macro.handlinger || []) {
        if (h.key === 'wait') { await new Promise(r => setTimeout(r, parseFloat(h.value) * 1000)); continue; }
        if (h.key === 'lt_trigger' && h.slot) await upsert(id, 'lt_slot', String(h.slot));
        await upsert(id, h.key, h.value);
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
    if (key === 'lt_trigger' && value === 'in' && slot) {
      await upsert(id, 'lt_slot', String(slot));
    }
    await upsert(id, key, value);
    res.status(200).json({ ok: true, key, value, slot: slot || undefined });
  } catch (err) {
    res.status(502).json({ error: String(err.message) });
  }
}
