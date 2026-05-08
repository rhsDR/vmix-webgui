import fs from 'fs';
import path from 'path';

import { SB_URL, SB_ANON } from './_supabase.js';
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
  if (!m) { console.warn('Hold ikke fundet i database:', apiName); return { lang: apiName, kort: apiName.substring(0, 3).toUpperCase() }; }
  return { lang: m.lang, kort: m.kort };
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
    date:      d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' }),
    timestamp: f.fixture.timestamp
  };
}

function loadCache(filename) {
  try {
    const fp   = path.join(process.cwd(), 'api', 'data', filename);
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return Array.isArray(data.response) ? data : null;
  } catch { return null; }
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

  // Dato-søgning
  const date = (req.query.date || '').trim();
  if (!date) return res.status(400).json({ error: 'Mangler id eller date parameter' });

  try {
    // Brug cachede filer hvis de findes — kald API per liga hvis ikke
    const AF = 'https://v3.football.api-sports.io';
    const afHeaders = { 'x-apisports-key': API_KEY };

    const [slData, pkData] = await Promise.all([
      (async () => loadCache('sl2024.json') || await fetch(`${AF}/fixtures?league=119&season=2024`, { headers: afHeaders }).then(r => r.json()).catch(() => ({ response: [] })))(),
      (async () => loadCache('pk2024.json') || await fetch(`${AF}/fixtures?league=121&season=2024`, { headers: afHeaders }).then(r => r.json()).catch(() => ({ response: [] })))()
    ]);

    const all = [...(slData.response || []), ...(pkData.response || [])];
    const fixtures = all
      .filter(f => f.fixture.date.startsWith(date))
      .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp)
      .map(f => formatFixture(f, holdMap));

    return res.status(200).json({ fixtures });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
