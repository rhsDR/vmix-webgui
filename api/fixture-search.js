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
    // Søg hold der matcher søgetermen
    const teamRes = await fetch(
      `https://v3.football.api-sports.io/teams?search=${encodeURIComponent(qClean)}`,
      { headers: { 'x-apisports-key': API_KEY } }
    );
    const teamData = await teamRes.json();
    const teams = (teamData.response || []).map(t => t.team.id);

    if (teams.length === 0) return res.status(200).json({ fixtures: [], debug: { teamSearch: teamData } });

    // Hent kommende kampe for de fundne hold i Superligaen (league 119, sæson 2025)
    const fixturePromises = teams.slice(0, 3).map(teamId =>
      fetch(
        `https://v3.football.api-sports.io/fixtures?team=${teamId}&league=119&season=2025&next=5`,
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

    return res.status(200).json({ fixtures, debug: { teamIds: teams, fixtureCount: fixtures.length, rawFixtures: fixtureResults.map(f => f.response?.slice(0,2)) } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
