import { requireUser } from './_auth.js';

// Udleverer trigger-tokenet til loggede brugere, så kontrolpanelet kan vise
// færdige Companion-URLs med token indsat. Selve tokenet bor kun i Vercel.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (await requireUser(req, res)) return;

  const token = process.env.TRIGGER_TOKEN;
  if (!token) return res.status(503).json({ error: 'TRIGGER_TOKEN er ikke sat i Vercel' });

  return res.status(200).json({ token });
}
