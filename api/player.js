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
  } catch (err) {
    return { ok: false, json: null };
  }
}

function extractParticipant(json) {
  if (!json) return null;
  const obj = json.participant
    ? json.participant
    : json.participants
      ? json.participants
      : json;
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

  // Prøv alle kendte profil-URL-mønstre — ét af dem virker afhængig af spillerens ID
  const profileUrls = [
    `${EAPI_BASE}/participant/${id}/?${auth}`,
    `${EAPI_BASE}/participant/details/${id}/?${auth}`,
    `${EAPI_BASE}/participant/details/?id=${id}&${auth}`,
    `${EAPI_BASE}/participant/?id=${id}&${auth}`,
  ];

  let part = null;
  for (const url of profileUrls) {
    const r = await tryFetch(url);
    if (r.ok) {
      part = extractParticipant(r.json);
      if (part) break;
    }
  }

  if (!part) return res.status(404).json({ error: 'Spillerdata ikke tilgængeligt' });

  // Prøv statistik-endpoints parallelt
  const statsUrls = [
    `${EAPI_BASE}/participant/${id}/statistics/?${auth}`,
    `${EAPI_BASE}/participant/${id}/stats/?${auth}`,
    `${EAPI_BASE}/participant/${id}/career/?${auth}`,
    `${EAPI_BASE}/participant/${id}/seasons/?${auth}`,
    `${EAPI_BASE}/participant/${id}/tournaments/?${auth}`,
    `${EAPI_BASE}/participant/statistics/?id=${id}&${auth}`,
  ];

  const statsResults = await Promise.all(statsUrls.map(async url => {
    const r = await tryFetch(url);
    return {
      ep:     url.split('?')[0].replace(EAPI_BASE, ''),
      ok:     r.ok,
      keys:   r.ok && r.json ? Object.keys(r.json).join(',') : null,
      sample: r.ok && r.json ? JSON.stringify(r.json).substring(0, 300) : null
    };
  }));

  return res.status(200).json({
    raw:        part,
    statsDebug: statsResults
  });
}
