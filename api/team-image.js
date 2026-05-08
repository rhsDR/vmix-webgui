const EAPI_BASE = 'https://eapi.enetpulse.com';

function detectImageType(buf) {
  if (buf.byteLength < 4) return null;
  const b = new Uint8Array(buf);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)                   return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46)                   return 'image/gif';
  const head = Buffer.from(buf.slice(0, 64)).toString('utf8');
  if (/<svg/i.test(head) || /^<\?xml/i.test(head.trim()))                return 'image/svg+xml';
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
    const r = await fetch(url);
    if (!r.ok) return res.status(404).end();
    const buf = await r.arrayBuffer();
    const contentType = detectImageType(buf);
    if (!contentType) return res.status(404).end();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(Buffer.from(buf));
  } catch {
    res.status(500).end();
  }
}
