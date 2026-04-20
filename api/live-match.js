import fs   from 'fs';
import path from 'path';

const API_BASE = 'https://v3.football.api-sports.io';
import { SB_URL, SB_ANON } from './_supabase.js';

const SB_HEADERS = { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' };

async function getHoldMap() {
  try {
    const res  = await fetch(`${SB_URL}/rest/v1/dropdowns?type=eq.hold&select=lang,kort,api_navn`, { headers: { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + SB_ANON } });
    const rows = await res.json();
    const map  = {};
    (rows || []).forEach(r => { if (r.api_navn) map[r.api_navn] = { lang: r.lang, kort: r.kort }; });
    return map;
  } catch { return {}; }
}

function mapHold(apiName, holdMap) {
  const m = holdMap[apiName];
  if (!m) { console.warn('Hold ikke fundet i database:', apiName); return { lang: apiName, kort: apiName.substring(0, 3).toUpperCase() }; }
  return { lang: m.lang, kort: m.kort };
}

function loadAllCached() {
  const files = ['sl2024.json', 'pk2024.json'];
  const all   = [];
  for (const f of files) {
    try {
      const fp   = path.join(process.cwd(), 'api', 'data', f);
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (Array.isArray(data.response)) all.push(...data.response);
    } catch { /* skip */ }
  }
  return all;
}

function loadCachedFile(filename) {
  try {
    const fp   = path.join(process.cwd(), 'api', 'data', filename);
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return Array.isArray(data.response) ? data : null;
  } catch { return null; }
}

async function loadSbCache(id) {
  try {
    const res  = await fetch(`${SB_URL}/rest/v1/fixture_cache?fixture_id=eq.${id}&select=events,stats`, { headers: SB_HEADERS });
    const rows = await res.json();
    if (!rows || !rows[0]) return { events: null, stats: null };
    return { events: rows[0].events, stats: rows[0].stats };
  } catch { return { events: null, stats: null }; }
}

async function saveSbCache(id, events, stats) {
  try {
    await fetch(`${SB_URL}/rest/v1/fixture_cache`, {
      method:  'POST',
      headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates' },
      body:    JSON.stringify({ fixture_id: id, events, stats, updated_at: new Date().toISOString() })
    });
  } catch { /* ikke kritisk */ }
}

function extractStats(statsData) {
  if (!statsData) return null;
  const KEYS = ['Ball Possession', 'Shots on Goal', 'Total Shots', 'Corner Kicks', 'Fouls', 'Passes %'];
  return statsData.response.map(team => ({
    team: team.team.name,
    stats: Object.fromEntries(
      team.statistics
        .filter(s => KEYS.includes(s.type) && s.value !== null)
        .map(s => [s.type, s.value])
    )
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const API_KEY = process.env.API_FOOTBALL_KEY;
  if (!API_KEY) return res.status(503).json({ error: 'API-nøgle ikke konfigureret' });

  const ids     = (req.query.ids || '').split(',').map(s => parseInt(s)).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'Mangler ids parameter' });

  const cached  = loadAllCached();
  const holdMap = await getHoldMap();
  const headers = { 'x-apisports-key': API_KEY };

  try {
    const results = await Promise.all(ids.map(async id => {
      const cached_f  = cached.find(f => f.fixture.id === id);
      const fileEvents = loadCachedFile(`events_${id}.json`);
      const fileStats  = loadCachedFile(`stats_${id}.json`);
      const sbCache    = (!fileEvents || !fileStats) ? await loadSbCache(id) : { events: null, stats: null };

      const [fixtureRes, eventsRes, statsRes] = await Promise.all([
        cached_f
          ? Promise.resolve({ response: [cached_f] })
          : fetch(`${API_BASE}/fixtures?id=${id}`, { headers }).then(r => r.json()).catch(() => ({ response: [] })),
        fileEvents
          ? Promise.resolve(fileEvents)
          : sbCache.events
            ? Promise.resolve({ response: sbCache.events })
            : fetch(`${API_BASE}/fixtures/events?fixture=${id}`, { headers }).then(r => r.json()).catch(() => ({ response: [] })),
        fileStats
          ? Promise.resolve(fileStats)
          : sbCache.stats
            ? Promise.resolve({ response: sbCache.stats })
            : fetch(`${API_BASE}/fixtures/statistics?fixture=${id}`, { headers }).then(r => r.json()).catch(() => ({ response: [] }))
      ]);

      const f      = fixtureRes.response?.[0];
      const events = eventsRes.response || [];

      if (!f) return { id, error: 'Ikke fundet' };

      // Gem i Supabase hvis data kom fra live API (ingen fil- eller sb-cache fandtes)
      if (!fileEvents && !sbCache.events && events.length) {
        saveSbCache(id, events, statsRes.response || []);
      }

      const home = mapHold(f.teams.home.name, holdMap);
      const away = mapHold(f.teams.away.name, holdMap);

      return {
        id,
        home:      home.lang,
        home_kort: home.kort,
        away:      away.lang,
        away_kort: away.kort,
        home_api:  f.teams.home.name,
        away_api:  f.teams.away.name,
        stats:     extractStats(statsRes),
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
