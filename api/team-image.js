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
    const r    = await fetch(url);
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    console.log(`[team-image] teamFK=${teamFK} status=${r.status} size=${text.length} keys=${json ? JSON.stringify(Object.keys(json)) : 'not-json'} sample=${text.slice(0, 120)}`);
    res.status(200).json({ keys: json ? Object.keys(json) : null, sample: text.slice(0, 200) });
  } catch (err) {
    console.error('[team-image] error:', err.message);
    res.status(500).end();
  }
}
