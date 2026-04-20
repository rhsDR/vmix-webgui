import { SB_URL, SB_ANON } from './_supabase.js';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function requireAdmin(req, res) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Verificer token og hent bruger
  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + token }
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Unauthorized' });
  const { id: userId } = await userRes.json();
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // Tjek admin-rolle
  const roleRes = await fetch(`${SB_URL}/rest/v1/user_roles?user_id=eq.${userId}&role=eq.admin&select=user_id`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
  });
  const roles = await roleRes.json();
  if (!Array.isArray(roles) || !roles.length) return res.status(403).json({ error: 'Forbidden' });

  return null; // OK
}
