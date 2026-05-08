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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const username = process.env.ENETPULSE_USERNAME;
  const token    = process.env.ENETPULSE_TOKEN;
  if (!username || !token) return res.status(503).json({ error: 'Enetpulse credentials mangler' });

  const tournamentFK = (req.query.tournamentFK || '').trim();
  const teamId       = (req.query.teamId || '').trim();
  if (!tournamentFK) return res.status(400).json({ error: 'Mangler tournamentFK parameter' });

  const auth = `username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;
  const base = `includeStandingData=yes&includeStandingParticipants=yes&${auth}`;

  // Prøv alle kendte standings-varianter parallelt
  const urls = [
    `${EAPI_BASE}/standing/?object=tournament_stage&objectFK=${tournamentFK}&${base}`,
    `${EAPI_BASE}/standing/?object=tournament&objectFK=${tournamentFK}&${base}`,
    `${EAPI_BASE}/standing/tournament_stage/?objectFK=${tournamentFK}&${base}`,
    `${EAPI_BASE}/standing/event_stats/?object=tournament_stage&objectFK=${tournamentFK}&${base}`,
  ];

  const results = await Promise.all(urls.map(async url => {
    const r = await tryFetch(url);
    return {
      ep:     url.split('?')[0].replace(EAPI_BASE, '') + '?object=' + (url.match(/object=([^&]+)/)?.[1] || '?'),
      ok:     r.ok,
      keys:   r.ok ? Object.keys(r.json || {}).join(',') : null,
      sample: r.ok ? JSON.stringify(r.json).substring(0, 500) : null
    };
  }));

  const successful = results.find(r => r.ok);
  if (!successful) {
    return res.status(404).json({ error: 'Holdstatistik ikke tilgængeligt', debug: results });
  }

  // Forsøg at filtrere for specifikt hold
  const raw = (await tryFetch(urls[results.indexOf(successful)])).json;

  return res.status(200).json({ debug: results, raw });
}
