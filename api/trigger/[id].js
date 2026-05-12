import { SB_URL, SB_ANON } from '../_supabase.js';

const ALLOWED_KEYS = [
  'breaking_trigger',
  'ticker_ovl_trigger',
  'stilling_trigger',
  'lineup_trigger',
  'credits_trigger',
];

const HEADERS = {
  'apikey': SB_ANON,
  'Authorization': 'Bearer ' + SB_ANON,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal,resolution=merge-duplicates'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'projekt id mangler' });

  const key   = req.query.key   || '';
  const value = req.query.value || '';

  if (!ALLOWED_KEYS.includes(key)) return res.status(400).json({ error: 'Ukendt key: ' + key });
  if (!value) return res.status(400).json({ error: 'value mangler' });

  try {
    const sbRes = await fetch(`${SB_URL}/rest/v1/settings`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ projekt_id: id, key, value })
    });
    if (!sbRes.ok) throw new Error('Supabase fejl ' + sbRes.status);
    res.status(200).json({ ok: true, key, value });
  } catch (err) {
    res.status(502).json({ error: String(err.message) });
  }
}
