const API_BASE = 'https://v3.football.api-sports.io';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const API_KEY = process.env.API_FOOTBALL_KEY;
  if (!API_KEY) return res.status(503).json({ error: 'API-nøgle ikke konfigureret' });

  const ids = (req.query.ids || '').split(',').map(s => parseInt(s)).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'Mangler ids parameter' });

  const headers = { 'x-apisports-key': API_KEY };

  try {
    // Hent fixture + events per kamp (individuelle kald — mere robust)
    const results = await Promise.all(ids.map(async id => {
      const [fixtureRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE}/fixtures?id=${id}`, { headers }).then(r => r.json()).catch(() => ({ response: [] })),
        fetch(`${API_BASE}/fixtures/events?fixture=${id}`, { headers }).then(r => r.json()).catch(() => ({ response: [] }))
      ]);

      const f      = fixtureRes.response?.[0];
      const events = eventsRes.response || [];

      if (!f) return { id, error: 'Ikke fundet' };

      return {
        id,
        home:      f.teams.home.name,
        away:      f.teams.away.name,
        homeGoals: f.goals.home ?? 0,
        awayGoals: f.goals.away ?? 0,
        status: {
          short:   f.fixture.status.short,
          elapsed: f.fixture.status.elapsed
        },
        league: f.league.name,
        events: events.map(e => ({
          minute: e.time.elapsed + (e.time.extra ? '+' + e.time.extra : ''),
          team:   e.team.name,
          player: e.player.name,
          assist: e.assist?.name || null,
          type:   e.type,
          detail: e.detail
        }))
      };
    }));

    return res.status(200).json({ matches: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
