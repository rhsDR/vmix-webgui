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
    const r   = await fetch(url);
    const ct  = r.headers.get('content-type') || '';
    const buf = await r.arrayBuffer();
    const hex = Buffer.from(buf.slice(0, 8)).toString('hex');
    console.log(`[team-image] teamFK=${teamFK} status=${r.status} ct="${ct}" size=${buf.byteLength} hex=${hex}`);

    if (!r.ok) return res.status(404).end();
    res.status(200).json({ status: r.status, ct, size: buf.byteLength, hex });
  } catch (err) {
    console.error('[team-image] error:', err.message);
    res.status(500).end();
  }
}
