const EAPI_BASE = 'https://eapi.enetpulse.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const username = process.env.ENETPULSE_USERNAME;
  const token    = process.env.ENETPULSE_TOKEN;
  if (!username || !token) return res.status(503).json({ error: 'credentials mangler' });

  const { p1, p2 } = req.query;
  if (!p1 || !p2) return res.status(400).json({ error: 'Mangler p1/p2 parameter' });

  const auth = `username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;
  const url  = `${EAPI_BASE}/event/h2h/?participant1FK=${encodeURIComponent(p1)}&participant2FK=${encodeURIComponent(p2)}&limit=5&includeVenue=yes&${auth}`;

  try {
    const r    = await fetch(url);
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { return res.status(500).json({ error: 'Ugyldig JSON fra enetpulse' }); }
    if (json.error_message || Object.keys(json).length === 0)
      return res.status(404).json({ error: json.error_message || 'Ingen H2H data' });
    return res.status(200).json({ ok: true, data: json });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
