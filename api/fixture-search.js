export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const id = parseInt(req.query.id || '');
  if (!id) return res.status(400).json({ error: 'Mangler fixture id' });

  const API_KEY = process.env.API_FOOTBALL_KEY;
  if (!API_KEY) return res.status(503).json({ error: 'API-nøgle ikke konfigureret' });

  try {
    const fd = await fetch(
      `https://v3.football.api-sports.io/fixtures?id=${id}`,
      { headers: { 'x-apisports-key': API_KEY } }
    ).then(r => r.json());

    const f = fd.response?.[0];
    if (!f) return res.status(200).json({ fixture: null });

    const d = new Date(f.fixture.date);
    return res.status(200).json({
      fixture: {
        id:        f.fixture.id,
        home:      f.teams.home.name,
        home_kort: f.teams.home.name.substring(0, 3).toUpperCase(),
        away:      f.teams.away.name,
        away_kort: f.teams.away.name.substring(0, 3).toUpperCase(),
        league:    f.league.name,
        date:      d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
