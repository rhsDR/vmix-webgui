import { requireAdmin } from './_auth.js';

// Samlet admin-bruger-endpoint. Lagt sammen fra delete-user.js + set-password.js for at
// holde os under Vercel Hobby-planens grænse på 12 serverless functions.
//   POST { userId, action: 'delete' }  → sletter brugeren
//   POST { userId, action: 'reset'  }  → nulstiller kode til DEFAULT_INVITE_PASSWORD
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (await requireAdmin(req, res)) return;

  const { userId, action } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId mangler' });

  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return res.status(503).json({ error: 'Service key ikke konfigureret' });
  const supabaseUrl = 'https://rxzxdcweqpbnvfkpnnrn.supabase.co';

  try {
    if (action === 'delete') {
      const response = await fetch(supabaseUrl + '/auth/v1/admin/users/' + userId, {
        method: 'DELETE',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey }
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return res.status(400).json({ error: data.message || 'Fejl ved sletning' });
      }
      return res.status(200).json({ success: true });
    }

    if (action === 'reset') {
      const DEFAULT_PASSWORD = process.env.DEFAULT_INVITE_PASSWORD;
      if (!DEFAULT_PASSWORD) return res.status(503).json({ error: 'DEFAULT_INVITE_PASSWORD er ikke sat i Vercel' });
      const response = await fetch(supabaseUrl + '/auth/v1/admin/users/' + userId, {
        method: 'PUT',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: DEFAULT_PASSWORD, email_confirm: true })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Fejl' });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ukendt action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
