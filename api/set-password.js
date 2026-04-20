import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (await requireAdmin(req, res)) return;

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Mangler userId' });

  const SB_URL         = 'https://rxzxdcweqpbnvfkpnnrn.supabase.co';
  const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return res.status(503).json({ error: 'Service key ikke konfigureret' });

  const DEFAULT_PASSWORD = 'DR35203040';

  try {
    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: DEFAULT_PASSWORD, email_confirm: true })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Fejl' });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
