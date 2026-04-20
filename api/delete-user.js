import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (await requireAdmin(req, res)) return;

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId mangler' });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = 'https://rxzxdcweqpbnvfkpnnrn.supabase.co';

  try {
    const response = await fetch(supabaseUrl + '/auth/v1/admin/users/' + userId, {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey
      }
    });

    if (!response.ok) {
      const data = await response.json();
      return res.status(400).json({ error: data.message || 'Fejl ved sletning' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
