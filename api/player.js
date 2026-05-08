const EAPI_BASE = 'https://eapi.enetpulse.com';

async function tryFetch(url) {
  try {
    const r    = await fetch(url);
    const text = await r.text();
    try {
      const json = JSON.parse(text);
      return { ok: !json.error_message && Object.keys(json).length > 0, json };
    } catch {
      return { ok: false, json: null };
    }
  } catch {
    return { ok: false, json: null };
  }
}

function extractParticipant(json) {
  if (!json) return null;
  const obj = json.participant || json.participants || json;
  const values = Object.values(obj);
  return (values[0] && typeof values[0] === 'object') ? values[0] : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const username = process.env.ENETPULSE_USERNAME;
  const token    = process.env.ENETPULSE_TOKEN;
  if (!username || !token) return res.status(503).json({ error: 'Enetpulse credentials mangler' });

  const id = (req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Mangler id parameter' });

  const auth = `username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;

  const profileUrls = [
    `${EAPI_BASE}/participant/${id}/?${auth}`,
    `${EAPI_BASE}/participant/details/${id}/?${auth}`,
    `${EAPI_BASE}/participant/details/?id=${id}&${auth}`,
    `${EAPI_BASE}/participant/?id=${id}&${auth}`,
  ];

  for (const url of profileUrls) {
    const r = await tryFetch(url);
    if (r.ok) {
      const part = extractParticipant(r.json);
      if (part) return res.status(200).json({ raw: part });
    }
  }

  return res.status(404).json({ error: 'Spillerdata ikke tilgængeligt' });
}
