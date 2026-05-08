const EAPI_BASE = 'https://eapi.enetpulse.com';

function findBase64(obj, depth = 0) {
  if (!obj || depth > 3) return null;
  for (const val of Object.values(obj)) {
    if (typeof val === 'string' && val.length > 100 && /^[A-Za-z0-9+/]/.test(val))
      return val;
    if (val && typeof val === 'object') {
      const found = findBase64(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export default async function handler(req, res) {
  const username = process.env.ENETPULSE_USERNAME;
  const token    = process.env.ENETPULSE_TOKEN;
  if (!username || !token) return res.status(503).end();

  const { teamFK, type } = req.query;
  if (!teamFK) return res.status(400).end();

  const endpoint = type === 'shirt' ? 'team_shirt' : 'team_logo';
  const auth = `username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;
  const url  = `${EAPI_BASE}/image/${endpoint}/?teamFK=${encodeURIComponent(teamFK)}&${auth}`;

  try {
    const r  = await fetch(url);
    if (!r.ok) return res.status(404).end();
    const ct = r.headers.get('content-type') || '';

    // Enetpulse returnerer direkte binær data
    if (ct.startsWith('image/')) {
      const buf = await r.arrayBuffer();
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).send(Buffer.from(buf));
    }

    // Enetpulse returnerer base64 i JSON
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { return res.status(404).end(); }

    const b64 = findBase64(json);
    if (!b64) return res.status(404).end();

    const buf = Buffer.from(b64, 'base64');
    let imgType = 'image/png';
    if (buf[0] === 0xFF && buf[1] === 0xD8) imgType = 'image/jpeg';
    if (buf[0] === 0x47 && buf[1] === 0x49) imgType = 'image/gif';

    res.setHeader('Content-Type', imgType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buf);
  } catch {
    return res.status(500).end();
  }
}
