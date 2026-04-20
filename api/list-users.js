import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (await requireAdmin(req, res)) return;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = 'https://rxzxdcweqpbnvfkpnnrn.supabase.co';

  try {
    const [usersRes, rolesRes] = await Promise.all([
      fetch(supabaseUrl + '/auth/v1/admin/users?per_page=200', {
        headers: {
          'apikey': serviceKey,
          'Authorization': 'Bearer ' + serviceKey
        }
      }),
      fetch(supabaseUrl + '/rest/v1/user_roles?select=*', {
        headers: {
          'apikey': serviceKey,
          'Authorization': 'Bearer ' + serviceKey,
          'Content-Type': 'application/json'
        }
      })
    ]);

    const usersData = await usersRes.json();
    const roles = await rolesRes.json();

    const roleMap = {};
    roles.forEach(r => { roleMap[r.user_id] = r.role; });

    const users = (usersData.users || []).map(u => ({
      id:         u.id,
      email:      u.email,
      created_at: u.created_at,
      last_sign_in: u.last_sign_in_at,
      role:       roleMap[u.id] || 'user'
    }));

    return res.status(200).json({ users });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
