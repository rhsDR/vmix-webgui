import { SB_URL, SB_ANON } from '../_supabase.js';
const HEADERS = {
  'apikey': SB_ANON,
  'Authorization': 'Bearer ' + SB_ANON,
  'Content-Type': 'application/json'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'projekt id mangler' });

  const pid = encodeURIComponent(id);
  const url = `${SB_URL}/rest/v1/settings?key=eq.credits_trigger&projekt_id=eq.${pid}`;

  const sbRes = await fetch(url, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ value: 'in' })
  });

  if (!sbRes.ok) {
    return res.status(502).json({ error: 'Supabase fejl: ' + sbRes.status });
  }

  res.status(200).json({ ok: true });
}
