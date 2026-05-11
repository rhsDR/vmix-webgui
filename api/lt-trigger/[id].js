import { SB_URL, SB_ANON } from '../_supabase.js';

const HEADERS = {
  'apikey': SB_ANON,
  'Authorization': 'Bearer ' + SB_ANON,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
};

async function upsert(pid, key, value) {
  const res = await fetch(`${SB_URL}/rest/v1/settings`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ projekt_id: pid, key, value })
  });
  if (!res.ok) throw new Error('Supabase fejl ' + res.status);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'projekt id mangler' });

  const slot = req.query.slot || '';

  try {
    if (slot) {
      // Sæt slot og trigger in
      await upsert(id, 'lt_slot', String(slot));
      await upsert(id, 'lt_trigger', 'in');
    } else {
      // Ingen slot = tag af
      await upsert(id, 'lt_trigger', 'out');
    }
    res.status(200).json({ ok: true, slot: slot || null });
  } catch (err) {
    res.status(502).json({ error: String(err.message) });
  }
}
