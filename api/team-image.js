const EAPI_BASE = 'https://eapi.enetpulse.com';

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
    const r = await fetch(url);
    if (!r.ok) return res.status(404).end();
    const contentType = r.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buf = await r.arrayBuffer();
    res.status(200).send(Buffer.from(buf));
  } catch {
    res.status(500).end();
  }
}
