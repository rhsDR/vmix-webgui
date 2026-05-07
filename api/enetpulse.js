import { SB_URL, SB_ANON } from './_supabase.js';

const EAPI_BASE = 'https://eapi.enetpulse.com';

// Kendte danske turneringer: { fk: 'Visningsnavn' }
const DANSKE_LIGAER = {
  '923100': 'Superligaen',   // mesterskabsspillet
  '923101': 'Superligaen',   // nedrykningsspillet
  '916899': 'A-Liga',        // kvinder
};
const SB_HEADERS = {
  'apikey': SB_ANON,
  'Authorization': 'Bearer ' + SB_ANON,
  'Content-Type': 'application/json'
};

async function getCachedFixtures(date) {
  try {
    const res  = await fetch(`${SB_URL}/rest/v1/enetpulse_cache?date=eq.${date}&select=events`, { headers: SB_HEADERS });
    const rows = await res.json();
    return rows?.[0]?.events || null;
  } catch { return null; }
}

async function saveFixturesCache(date, events) {
  try {
    await fetch(`${SB_URL}/rest/v1/enetpulse_cache`, {
      method:  'POST',
      headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates' },
      body:    JSON.stringify({ date, events, updated_at: new Date().toISOString() })
    });
  } catch { /* ikke kritisk */ }
}

function participantName(p) {
  return p.participant?.name || p.name || p.participant_name || p.shortName || '';
}

function getParticipants(ev) {
  const parts = ev.event_participants ? Object.values(ev.event_participants) : [];
  const home  = parts.find(p => String(p.number) === '1') || parts[0] || {};
  const away  = parts.find(p => String(p.number) === '2') || parts[1] || {};
  return { home, away };
}

function mapStatus(ev) {
  const st = (ev.status_type || '').toLowerCase();
  if (st === 'not_started' || st === 'notstarted')       return { short: 'NS',  elapsed: null };
  if (st === 'halftime')                                 return { short: 'HT',  elapsed: null };
  if (st === 'finished' || st === 'finished_aet' || st === 'finished_ap' || st === 'finalresult')
                                                         return { short: 'FT',  elapsed: null };
  if (st === 'cancelled' || st === 'postponed')          return { short: 'PST', elapsed: null };
  if (st === 'inprogress' || st === 'started') {
    const period  = (ev.period_type || ev.active_minute_period || '').toLowerCase();
    const elapsed = parseInt(ev.elapsed) || null;
    if (period.includes('2') || period.includes('second')) return { short: '2H', elapsed };
    if (period.includes('overtime') || period.includes('et')) return { short: 'ET', elapsed };
    return { short: '1H', elapsed };
  }
  return { short: st.toUpperCase().substring(0, 3), elapsed: null };
}

function mapIncident(inc, homeApiName, awayApiName, homePartId) {
  const t = (inc.incident_type_fk || '').toLowerCase();
  let type, detail;

  if (t.includes('goal') || t === 'goal_scored') {
    type   = 'Goal';
    detail = t.includes('own') ? 'Own Goal' : t.includes('penalty') ? 'Penalty' : 'Normal Goal';
  } else if (t.includes('yellow_red') || t.includes('yellowred') || t === 'yellow_red_card') {
    type = 'Card'; detail = 'Yellow Red Card';
  } else if (t.includes('red') || t === 'red_card') {
    type = 'Card'; detail = 'Red Card';
  } else if (t.includes('yellow') || t === 'yellow_card') {
    type = 'Card'; detail = 'Yellow Card';
  } else if (t.includes('subst') || t.includes('substitut')) {
    type = 'subst'; detail = 'Substitution';
  } else {
    return null;
  }

  const isHome = String(inc.team_participant_id) === String(homePartId)
               || String(inc.participant_team_id) === String(homePartId);
  const team   = isHome ? homeApiName : awayApiName;

  return {
    minute: String(parseInt(inc.elapsed) || inc.elapsed || ''),
    team,
    player: inc.participant_name || inc.player_name || '',
    assist: inc.assist_participant_name || inc.assist_name || null,
    type,
    detail
  };
}

function normalizeFixtures(raw) {
  const events = raw?.events || {};
  const evList = Object.values(events).filter(ev => ev.id);
  // Log participant struktur fra første event (til debugging af navn-felter)
  if (evList.length > 0) {
    const parts = evList[0].event_participants ? Object.values(evList[0].event_participants) : [];
    console.log('[enetpulse] sample participant keys:', parts[0] ? Object.keys(parts[0]) : 'ingen');
    console.log('[enetpulse] sample participant[0]:', JSON.stringify(parts[0]).substring(0, 300));
  }
  const danskeFK = new Set(Object.keys(DANSKE_LIGAER));
  return evList
    .map(ev => {
      const fk = String(ev.tournament_stageFK || ev.tournament_templateFK || ev.tournamentFK || '');
      const { home, away } = getParticipants(ev);
      const startdate = ev.startdate || '';
      const timePart  = startdate.includes('T') ? startdate.split('T')[1].substring(0, 5)
                      : startdate.includes(' ') ? startdate.split(' ')[1].substring(0, 5) : '';
      return {
        id:            String(ev.id),
        starttime:     timePart,
        startdate,
        home_enet:     participantName(home),
        away_enet:     participantName(away),
        tournament:    DANSKE_LIGAER[fk] || ev.tournament_stage_name || ev.tournament_name || '',
        tournament_fk: fk,
        status:        ev.status_type || 'not_started',
        dansk:         danskeFK.has(fk)
      };
    })
    .filter(f => f.dansk)   // kun kendte danske ligaer returneres
    .sort((a, b) => a.startdate.localeCompare(b.startdate));
}

function normalizeEventDetails(raw, id) {
  const events = raw?.events || {};
  const ev     = Object.values(events)[0];
  if (!ev) return { id, error: 'Ikke fundet' };

  const { home, away } = getParticipants(ev);
  const homeApiName    = participantName(home);
  const awayApiName    = participantName(away);
  const homePartId     = home.participantFK || home.id || '';

  function scoreFromResult(participant) {
    if (!participant.result) return 0;
    const entries = Object.values(participant.result);
    const ot = entries.find(r => r.result_code === 'ordinarytime');
    if (ot) return parseInt(ot.value) || 0;
    // fallback: første numeriske value
    const first = entries[0];
    return parseInt(first?.value) || 0;
  }

  const homeGoals = scoreFromResult(home);
  const awayGoals = scoreFromResult(away);

  const incidents = ev.incident ? Object.values(ev.incident) : [];
  const mappedEvents = incidents
    .map(inc => mapIncident(inc, homeApiName, awayApiName, homePartId))
    .filter(Boolean)
    .sort((a, b) => (parseInt(a.minute) || 0) - (parseInt(b.minute) || 0));

  return {
    id:        String(ev.id),
    home:      homeApiName,
    home_kort: '',         // udfyldes af frontend via kamp-state
    away:      awayApiName,
    away_kort: '',
    home_api:  homeApiName,
    away_api:  awayApiName,
    homeGoals,
    awayGoals,
    status:    mapStatus(ev),
    league:    ev.tournament_stage_name || ev.tournament_name || '',
    stats:     null,
    events:    mappedEvents
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const username = process.env.ENETPULSE_USERNAME;
  const token    = process.env.ENETPULSE_TOKEN;
  if (!username || !token) return res.status(503).json({ error: 'enetpulse credentials ikke konfigureret' });

  const { date, ids, debug } = req.query;

  // ── DEBUG: rå enetpulse JSON for første event ─────────────────
  if (date && debug === '1') {
    try {
      const url = `${EAPI_BASE}/event/daily/?sportFK=1&date=${encodeURIComponent(date)}&username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;
      const raw = await fetch(url).then(r => r.json());
      const evList = Object.values(raw?.events || {});
      const sample = evList[0] || null;
      const tournamentMap = {};
      evList.forEach(ev => {
        const fk   = String(ev.tournament_stageFK || ev.tournament_templateFK || ev.tournamentFK || '');
        const name = ev.tournament_stage_name || ev.tournament_name || '?';
        if (fk) tournamentMap[fk] = name;
      });
      return res.status(200).json({
        total_events: evList.length,
        tournament_fks: tournamentMap,
        sample_event_keys: sample ? Object.keys(sample) : [],
        sample_participants: sample?.event_participants
          ? Object.values(sample.event_participants).slice(0, 2)
          : [],
        sample_event: sample
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── DAGLIG KAMPLISTE (med Supabase-cache) ─────────────────────
  if (date) {
    try {
      const cached = await getCachedFixtures(date);
      if (cached) return res.status(200).json({ fixtures: cached, fromCache: true });

      const url = `${EAPI_BASE}/event/daily/?sportFK=1&date=${encodeURIComponent(date)}&username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;
      const raw  = await fetch(url).then(r => r.json());
      const fixtures = normalizeFixtures(raw);
      await saveFixturesCache(date, fixtures);
      return res.status(200).json({ fixtures, fromCache: false });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── LIVE EVENT-DETALJER (ingen cache — bruges til dashboard) ───
  if (ids) {
    const idList = String(ids).split(',').filter(Boolean);
    try {
      const results = await Promise.all(idList.map(async id => {
        const url = `${EAPI_BASE}/event/details/?id=${id}&includeIncidents=yes&username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;
        const raw = await fetch(url).then(r => r.json());
        if (debug === '1') return { id, raw_keys: Object.keys(raw || {}), raw_events_count: Object.keys(raw?.events || {}).length, raw };
        return normalizeEventDetails(raw, id);
      }));
      return res.status(200).json({ matches: results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Mangler date eller ids parameter' });
}
