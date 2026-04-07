export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Mangler søgeterm' });
  // API-Football accepterer kun alphanumeriske tegn og mellemrum
  const qClean = q.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  if (!qClean) return res.status(400).json({ error: 'Søgeterm indeholder kun specialtegn' });

  const API_KEY = process.env.API_FOOTBALL_KEY;
  if (!API_KEY) return res.status(503).json({ error: 'API-nøgle ikke konfigureret' });

  try {
    // Superliga hold — hard-coded ID'er
    const SUPERLIGA_HOLD = [
      { id: 395, navn: 'Vejle' },
      { id: 396, navn: 'Sonderjyske' },
      { id: 397, navn: 'FC Midtjylland' },
      { id: 398, navn: 'FC Nordsjaelland' },
      { id: 399, navn: 'Vendsyssel FF' },
      { id: 400, navn: 'FC Copenhagen' },
      { id: 401, navn: 'Randers FC' },
      { id: 402, navn: 'Aalborg' },
      { id: 403, navn: 'Esbjerg' },
      { id: 404, navn: 'AC Horsens' },
      { id: 405, navn: 'Odense' },
      { id: 406, navn: 'Aarhus' },
      { id: 407, navn: 'Brondby' },
      { id: 408, navn: 'Hobro' },
      { id: 625, navn: 'Lyngby' },
      { id: 2060, navn: 'AB Copenhagen' },
      { id: 2061, navn: 'FC Fredericia' },
      { id: 2062, navn: 'FC Helsingor' },
    ];

    // Søg lokalt — find hold der matcher søgetermen
    const matched = SUPERLIGA_HOLD.filter(h =>
      h.navn.toLowerCase().includes(qClean.toLowerCase())
    );
    if (matched.length === 0) return res.status(200).json({ fixtures: [] });
    const teams = matched.map(h => h.id);

    // Hent kommende kampe for matchede hold i Superligaen (league 119) — uden season parameter
    const fixturePromises = teams.slice(0, 3).map(teamId =>
      fetch(
        `https://v3.football.api-sports.io/fixtures?team=${teamId}&league=119&next=5`,
        { headers: { 'x-apisports-key': API_KEY } }
      ).then(r => r.json())
    );
    const fixtureResults = await Promise.all(fixturePromises);

    const seen = new Set();
    const fixtures = [];
    fixtureResults.forEach(fd => {
      (fd.response || []).forEach(f => {
        if (seen.has(f.fixture.id)) return;
        seen.add(f.fixture.id);
        const d = new Date(f.fixture.date);
        fixtures.push({
          id:        f.fixture.id,
          home:      f.teams.home.name,
          home_kort: f.teams.home.name.substring(0, 3).toUpperCase(),
          away:      f.teams.away.name,
          away_kort: f.teams.away.name.substring(0, 3).toUpperCase(),
          league:    f.league.name,
          date:      d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        });
      });
    });

    return res.status(200).json({ fixtures, debug: { teamIds: teams, fixtureCount: fixtures.length, rawFixtures: fixtureResults } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
