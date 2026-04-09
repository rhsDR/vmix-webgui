const SB_URL  = 'https://rxzxdcweqpbnvfkpnnrn.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4enhkY3dlcXBibnZma3BubnJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzYzMTUsImV4cCI6MjA5MDgxMjMxNX0.e6DtMVskOwcMyJBFJDIEYsSZC0HAcD7AhNcg5PvlArU';
const SB_HEADERS = { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + SB_ANON };

async function getHoldMap() {
  try {
    const res = await fetch(
      SB_URL + '/rest/v1/dropdowns?type=eq.hold&select=lang,kort,api_navn',
      { headers: SB_HEADERS }
    );
    const rows = await res.json();
    const map = {};
    (rows || []).forEach(r => {
      if (r.api_navn) map[r.api_navn] = { lang: r.lang, kort: r.kort };
    });
    return map;
  } catch { return {}; }
}

function mapHold(apiName, holdMap) {
  const m = holdMap[apiName];
  return m ? { lang: m.lang, kort: m.kort } : { lang: apiName, kort: apiName.substring(0, 3).toUpperCase() };
}

function formatFixture(f, holdMap) {
  const d    = new Date(f.fixture.date);
  const home = mapHold(f.teams.home.name, holdMap);
  const away = mapHold(f.teams.away.name, holdMap);
  return {
    id:        f.fixture.id,
    home:      home.lang,
    home_kort: home.kort,
    away:      away.lang,
    away_kort: away.kort,
    league:    f.league.name,
    date:      d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    timestamp: f.fixture.timestamp
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const API_KEY = process.env.API_FOOTBALL_KEY;
  if (!API_KEY) return res.status(503).json({ error: 'API-nøgle ikke konfigureret' });

  const holdMap = await getHoldMap();

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
      return res.status(200).json({ fixtures: [formatFixture(f, holdMap)] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Dato-søgning — hent alle Superliga kampe og filtrer på dato (YYYY-MM-DD)
  const date = (req.query.date || '').trim();
  if (!date) return res.status(400).json({ error: 'Mangler id eller date parameter' });

  try {
    // Hent alle Superliga (119) + Pokal (121) kampe fra begge sæsoner og filtrer på dato lokalt
    const [sl24, sl25, pk24, pk25] = await Promise.all([
      fetch(`https://v3.football.api-sports.io/fixtures?league=119&season=2024`, { headers: { 'x-apisports-key': API_KEY } }).then(r => r.json()).catch(() => ({ response: [] })),
      fetch(`https://v3.football.api-sports.io/fixtures?league=119&season=2025`, { headers: { 'x-apisports-key': API_KEY } }).then(r => r.json()).catch(() => ({ response: [] })),
      fetch(`https://v3.football.api-sports.io/fixtures?league=121&season=2024`, { headers: { 'x-apisports-key': API_KEY } }).then(r => r.json()).catch(() => ({ response: [] })),
      fetch(`https://v3.football.api-sports.io/fixtures?league=121&season=2025`, { headers: { 'x-apisports-key': API_KEY } }).then(r => r.json()).catch(() => ({ response: [] }))
    ]);

    const all = [...(sl24.response || []), ...(sl25.response || []), ...(pk24.response || []), ...(pk25.response || [])];
    const fixtures = all
      .filter(f => f.fixture.date.startsWith(date))
      .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)
      .map(f => formatFixture(f, holdMap));

    return res.status(200).json({ fixtures });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
