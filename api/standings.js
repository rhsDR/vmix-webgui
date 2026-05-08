const EAPI_BASE = 'https://eapi.enetpulse.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const username = process.env.ENETPULSE_USERNAME;
  const token    = process.env.ENETPULSE_TOKEN;
  if (!username || !token) return res.status(503).json({ error: 'Enetpulse credentials mangler' });

  const { type, object, objectFK } = req.query;
  if (!type || !objectFK) return res.status(400).json({ error: 'Mangler type eller objectFK parameter' });

  const auth = `username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;
  const obj  = object ? `object=${encodeURIComponent(object)}&` : '';
  const url  = `${EAPI_BASE}/standing/${encodeURIComponent(type)}/?${obj}objectFK=${encodeURIComponent(objectFK)}&includeStandingParticipants=yes&includeStandingData=yes&${auth}`;

  try {
    const r    = await fetch(url);
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { return res.status(500).json({ error: 'Ugyldig JSON fra enetpulse' }); }
    if (json.error_message || Object.keys(json).length === 0)
      return res.status(404).json({ error: json.error_message || 'Ingen data', raw: json });
    return res.status(200).json({ ok: true, data: json });
  } catch {
    return res.status(500).json({ error: 'Fetch fejlede' });
  }
}
