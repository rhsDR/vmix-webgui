import { SB_URL, SB_ANON } from './_supabase.js';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Verificerer JWT og returnerer userId — eller null hvis ugyldig/mangler.
async function getUserId(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;

  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + token }
  });
  if (!userRes.ok) return null;
  const { id: userId } = await userRes.json();
  return userId || null;
}

// Kræver blot en gyldig logget-ind bruger (ingen admin-rolle).
// Samme kontrakt som requireAdmin: truthy = fejlsvar sendt, null = OK.
export async function requireUser(req, res) {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  return null; // OK
}

export async function requireAdmin(req, res) {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // Tjek admin-rolle
  const roleRes = await fetch(`${SB_URL}/rest/v1/user_roles?user_id=eq.${userId}&role=eq.admin&select=user_id`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
  });
  const roles = await roleRes.json();
  if (!Array.isArray(roles) || !roles.length) return res.status(403).json({ error: 'Forbidden' });

  return null; // OK
}
