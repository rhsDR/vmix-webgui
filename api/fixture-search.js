function formatFixture(f) {
  const d = new Date(f.fixture.date);
  return {
    id:        f.fixture.id,
    home:      f.teams.home.name,
    home_kort: f.teams.home.name.substring(0, 3).toUpperCase(),
    away:      f.teams.away.name,
    away_kort: f.teams.away.name.substring(0, 3).toUpperCase(),
    league:    f.league.name,
    date:      d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    timestamp: f.fixture.timestamp
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const API_KEY = process.env.API_FOOTBALL_KEY;
  if (!API_KEY) return res.status(503).json({ error: 'API-nøgle ikke konfigureret' });

  // Direkte ID-opslag
  const id = parseInt(req.query.id || '');
  if (id) {
    try {
      const fd = await fetch(
        `https://v3.football.api-sports.io/fixtures?id=${id}`,
        { headers: { 'x-apisports-key': API_KEY } }
      ).then(r => r.json());
      const f = fd.response?.[0];
      if (!f) return res.status(200).json({ fixtures: [] });
      return res.status(200).json({ fixtures: [formatFixture(f)] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Holdnavn-søgning — hent alle Superliga kampe og filtrer
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.status(400).json({ error: 'Mangler id eller q parameter' });

  try {
    const fd = await fetch(
      `https://v3.football.api-sports.io/fixtures?league=119&season=2024`,
      { headers: { 'x-apisports-key': API_KEY } }
    ).then(r => r.json());

    const now = Date.now() / 1000;
    const fixtures = (fd.response || [])
      .filter(f =>
        f.teams.home.name.toLowerCase().includes(q) ||
        f.teams.away.name.toLowerCase().includes(q)
      )
      .sort((a, b) => Math.abs(a.fixture.timestamp - now) - Math.abs(b.fixture.timestamp - now))
      .slice(0, 8)
      .map(formatFixture);

    return res.status(200).json({ fixtures });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
