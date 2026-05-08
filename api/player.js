const EAPI_BASE = 'https://eapi.enetpulse.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const username = process.env.ENETPULSE_USERNAME;
  const token    = process.env.ENETPULSE_TOKEN;
  if (!username || !token) return res.status(503).json({ error: 'Enetpulse credentials mangler' });

  const id = (req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Mangler id parameter' });

  const auth = `username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;

  // participantFK er blacklistet — prøv id-i-sti og ?id= varianter
  const urls = [
    `${EAPI_BASE}/participant/${id}/?${auth}`,
    `${EAPI_BASE}/participant/details/${id}/?${auth}`,
    `${EAPI_BASE}/participant/details/?id=${id}&${auth}`,
    `${EAPI_BASE}/participant/?id=${id}&${auth}`,
  ];

  const attempts = [];
  for (const url of urls) {
    try {
      const r    = await fetch(url);
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { attempts.push({ url: url.split('?')[0].replace(EAPI_BASE, ''), error: 'Ikke JSON: ' + text.substring(0, 80) }); continue; }

      const urlShort = url.split('?')[0].replace(EAPI_BASE, '');
      attempts.push({ url: urlShort, response: json });

      if (json && !json.error_message && Object.keys(json).length > 0) {
        const part = json.participant
          ? Object.values(json.participant)[0]
          : json.participants
            ? Object.values(json.participants)[0]
            : Object.values(json)[0];
        return res.status(200).json({ raw: part || json });
      }
    } catch (err) {
      attempts.push({ url: url.split('?')[0].replace(EAPI_BASE, ''), error: err.message });
    }
  }

  return res.status(404).json({ error: 'Spillerdata ikke tilgængeligt', debug: attempts });
}
