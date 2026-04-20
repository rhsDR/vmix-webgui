export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email mangler' });

  const DEFAULT_PASSWORD = 'DR35203040';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = 'https://rxzxdcweqpbnvfkpnnrn.supabase.co';

  try {
    // Send invitation-mail
    const response = await fetch(supabaseUrl + '/auth/v1/invite', {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(400).json({ error: data.message || data.msg || 'Fejl ved invitation' });
    }

    // Sæt default kode så brugeren kan logge ind med det samme
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${data.id}`, {
      method: 'PUT',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: DEFAULT_PASSWORD })
    });

    return res.status(200).json({ id: data.id, email: data.email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
