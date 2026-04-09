// Mapping fra API-Football navne → danske navne og forkortelser
const HOLD_MAP = {
  'Brondby':              { lang: 'Brøndby',              kort: 'BIF' },
  'FC Copenhagen':        { lang: 'FC København',          kort: 'FCK' },
  'FC Midtjylland':       { lang: 'FC Midtjylland',        kort: 'FCM' },
  'FC Nordsjaelland':     { lang: 'FC Nordsjælland',       kort: 'FCN' },
  'Aarhus':               { lang: 'AGF',                   kort: 'AGF' },
  'Randers FC':           { lang: 'Randers FC',            kort: 'RFC' },
  'Aalborg':              { lang: 'AAB',                   kort: 'AAB' },
  'Vejle':                { lang: 'Vejle Boldklub',        kort: 'VB'  },
  'Odense':               { lang: 'Odense Boldklub',       kort: 'OB'  },
  'Sonderjyske':          { lang: 'Sønderjyske Fodbold',   kort: 'SJF' },
  'Silkeborg':            { lang: 'Silkeborg',             kort: 'SIF' },
  'Viborg':               { lang: 'Viborg FC',             kort: 'VFF' },
  'FC Fredericia':        { lang: 'FC Fredericia',         kort: 'FCF' },
  'Lyngby':               { lang: 'Lyngby',                kort: 'LBK' },
  'AB Copenhagen':        { lang: 'AB',                    kort: 'AB'  },
  'AC Horsens':           { lang: 'AC Horsens',            kort: 'ACH' },
  'Hobro':                { lang: 'Hobro',                 kort: 'HIF' },
  'Vendsyssel FF':        { lang: 'Vendsyssel FF',         kort: 'VFF' },
};

function mapHold(apiName) {
  const m = HOLD_MAP[apiName];
  return m ? { lang: m.lang, kort: m.kort } : { lang: apiName, kort: apiName.substring(0, 3).toUpperCase() };
}

function formatFixture(f) {
  const d    = new Date(f.fixture.date);
  const home = mapHold(f.teams.home.name);
  const away = mapHold(f.teams.away.name);
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

  // Dato-søgning — hent alle Superliga kampe og filtrer på dato (YYYY-MM-DD)
  const date = (req.query.date || '').trim();
  if (!date) return res.status(400).json({ error: 'Mangler id eller date parameter' });

  try {
    const fd = await fetch(
      `https://v3.football.api-sports.io/fixtures?league=119&season=2024`,
      { headers: { 'x-apisports-key': API_KEY } }
    ).then(r => r.json());

    const fixtures = (fd.response || [])
      .filter(f => f.fixture.date.startsWith(date))
      .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)
      .map(formatFixture);

    return res.status(200).json({ fixtures });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
