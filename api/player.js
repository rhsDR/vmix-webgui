const EAPI_BASE = 'https://eapi.enetpulse.com';

async function tryFetch(url) {
  try {
    const r    = await fetch(url);
    const text = await r.text();
    try {
      const json = JSON.parse(text);
      return { ok: !json.error_message && Object.keys(json).length > 0, json };
    } catch {
      return { ok: false, json: null, error: 'Ikke JSON: ' + text.substring(0, 80) };
    }
  } catch (err) {
    return { ok: false, json: null, error: err.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const username = process.env.ENETPULSE_USERNAME;
  const token    = process.env.ENETPULSE_TOKEN;
  if (!username || !token) return res.status(503).json({ error: 'Enetpulse credentials mangler' });

  const id = (req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Mangler id parameter' });

  const auth = `username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;

  // Hent spillerprofil (sti-baseret ID virker)
  const profileResult = await tryFetch(`${EAPI_BASE}/participant/${id}/?${auth}`);
  if (!profileResult.ok) {
    return res.status(404).json({ error: 'Spillerdata ikke tilgængeligt', debug: profileResult });
  }

  const raw = profileResult.json;
  const part = raw.participant
    ? Object.values(raw.participant)[0]
    : raw.participants
      ? Object.values(raw.participants)[0]
      : Object.values(raw)[0];

  // Prøv statistik-endpoints parallelt
  const statsEndpoints = [
    `/participant/${id}/statistics/?${auth}`,
    `/participant/${id}/stats/?${auth}`,
    `/participant/${id}/career/?${auth}`,
    `/participant/${id}/seasons/?${auth}`,
    `/participant/${id}/tournaments/?${auth}`,
    `/participant/statistics/?id=${id}&${auth}`,
    `/participant/career/?id=${id}&${auth}`,
  ];

  const statsResults = await Promise.all(
    statsEndpoints.map(async ep => {
      const r = await tryFetch(`${EAPI_BASE}${ep}`);
      return { ep: ep.split('?')[0], ok: r.ok, keys: r.json ? Object.keys(r.json).join(',') : null, error: r.error, sample: r.ok ? JSON.stringify(r.json).substring(0, 200) : null };
    })
  );

  const statsDebug = statsResults.filter(r => r.ok);
  const successfulStats = statsResults.find(r => r.ok);

  return res.status(200).json({
    raw:        part || raw,
    statsDebug: statsResults,   // vis alle forsøg
    stats:      successfulStats ? successfulStats.sample : null
  });
}
