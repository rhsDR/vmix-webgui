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

  // Ugedag-søgning — hent alle Superliga kampe og filtrer på ugedag
  // day: 0=søndag, 1=mandag, 2=tirsdag, 3=onsdag, 4=torsdag, 5=fredag, 6=lørdag
  const day = req.query.day !== undefined ? parseInt(req.query.day) : -1;
  const q   = (req.query.q || '').trim().toLowerCase();

  if (day === -1 && !q) return res.status(400).json({ error: 'Mangler id, day eller q parameter' });

  try {
    const fd = await fetch(
      `https://v3.football.api-sports.io/fixtures?league=119&season=2024`,
      { headers: { 'x-apisports-key': API_KEY } }
    ).then(r => r.json());

    const now = Date.now() / 1000;
    let fixtures = fd.response || [];

    if (day !== -1) {
      fixtures = fixtures.filter(f => new Date(f.fixture.date).getDay() === day);
    }
    if (q) {
      fixtures = fixtures.filter(f =>
        f.teams.home.name.toLowerCase().includes(q) ||
        f.teams.away.name.toLowerCase().includes(q)
      );
    }

    fixtures = fixtures
      .sort((a, b) => Math.abs(a.fixture.timestamp - now) - Math.abs(b.fixture.timestamp - now))
      .slice(0, 10)
      .map(formatFixture);

    return res.status(200).json({ fixtures });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
