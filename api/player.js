const EAPI_BASE = 'https://eapi.enetpulse.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const username = process.env.ENETPULSE_USERNAME;
  const token    = process.env.ENETPULSE_TOKEN;
  if (!username || !token) return res.status(503).json({ error: 'Enetpulse credentials mangler' });

  const id = (req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Mangler id parameter' });

  const auth = `username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;

  // Prøv participant/details endpoint
  const urls = [
    `${EAPI_BASE}/participant/details/?participantFK=${id}&${auth}`,
    `${EAPI_BASE}/participant/?participantFK=${id}&${auth}`,
  ];

  let raw = null;
  for (const url of urls) {
    try {
      const r    = await fetch(url);
      const json = await r.json();
      console.log('[player] url:', url, '→ keys:', Object.keys(json || {}).join(','));
      if (json && !json.error_message && Object.keys(json).length > 0) {
        raw = json;
        break;
      }
    } catch (err) {
      console.warn('[player] fetch fejl:', err.message);
    }
  }

  if (!raw) return res.status(404).json({ error: 'Spillerdata ikke tilgængeligt' });

  // Udtræk participant-objekt uanset nesting
  const part = raw.participant
    ? Object.values(raw.participant)[0]
    : raw.participants
      ? Object.values(raw.participants)[0]
      : Object.values(raw)[0];

  console.log('[player] participant keys:', part ? Object.keys(part).join(',') : 'ingen');

  return res.status(200).json({ raw: part || raw });
}
