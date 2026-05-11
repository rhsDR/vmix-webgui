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

function getElapsedMinute(ev) {
  const e = ev.elapsed;
  if (!e) return null;
  if (typeof e === 'number') return String(e);
  if (typeof e === 'string') return e;
  if (typeof e === 'object') {
    const entry = Object.values(e)[0];
    if (!entry) return null;
    const min   = entry.elapsed || '';
    const extra = parseInt(entry.injury_time_elapsed) || 0;
    return min + (extra > 0 ? '+' + extra : '');
  }
  return null;
}

// status_descFK: 1=not started, 2=1H, 3=2H, 4=penalty, 5=postponed, 6=finished, 8=ET-1H, 9=ET-2H
function mapStatus(ev) {
  const desc    = parseInt(ev.status_descFK || 0);
  const st      = (ev.status_type || '').toLowerCase();
  const elapsed = getElapsedMinute(ev);

  if (desc === 1 || st === 'not_started' || st === 'notstarted') return { short: 'NS',  elapsed: null };
  if (desc === 5 || st === 'postponed')                           return { short: 'PST', elapsed: null };
  if (desc === 6 || st === 'finished' || st === 'finished_aet' || st === 'finished_ap' || st === 'finalresult')
                                                                  return { short: 'FT',  elapsed: null };
  if (desc === 2)                                                 return { short: '1H',  elapsed };
  if (desc === 3)                                                 return { short: '2H',  elapsed };
  if (desc === 4 || st === 'penalties')                           return { short: 'P',   elapsed };
  if (desc === 8)                                                 return { short: 'ET',  elapsed };
  if (desc === 9)                                                 return { short: 'ET',  elapsed };

  // Fallback hvis descFK mangler — brug status_type + minut-heuristik
  const period = (ev.period_type || ev.active_minute_period || '').toLowerCase();
  if (st === 'halftime' || st === 'half_time' || period === 'ht') return { short: 'HT',  elapsed: null };
  if (st === 'inprogress' || st === 'started') {
    const min = parseInt(elapsed) || 0;
    if (min > 90 || period.includes('overtime') || period.includes('et')) return { short: 'ET', elapsed };
    if (min >= 46 || period.includes('2') || period.includes('second'))    return { short: '2H', elapsed };
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

function copenhagenTime(startdate) {
  if (!startdate) return '';
  try {
    const iso = startdate.includes('T') ? startdate : startdate.replace(' ', 'T');
    const d = new Date(/[Z+]/.test(iso) ? iso : iso + 'Z');
    const year = d.getUTCFullYear();
    const dstStart = new Date(Date.UTC(year, 2, 31)); dstStart.setUTCDate(31 - dstStart.getUTCDay()); dstStart.setUTCHours(1);
    const dstEnd   = new Date(Date.UTC(year, 9, 31)); dstEnd.setUTCDate(31 - dstEnd.getUTCDay());   dstEnd.setUTCHours(1);
    const offsetMin = (d >= dstStart && d < dstEnd) ? 120 : 60;
    const local = new Date(d.getTime() + offsetMin * 60000);
    return `${String(local.getUTCHours()).padStart(2,'0')}:${String(local.getUTCMinutes()).padStart(2,'0')}`;
  } catch { return ''; }
}

function normalizeFixtures(raw) {
  const events = raw?.events || {};
  const evList = Object.values(events).filter(ev => ev.id);
  const danskeFK = new Set(Object.keys(DANSKE_LIGAER));
  return evList
    .map(ev => {
      const fk = String(ev.tournament_stageFK || ev.tournament_templateFK || ev.tournamentFK || '');
      const { home, away } = getParticipants(ev);
      const startdate = ev.startdate || '';
      return {
        id:            String(ev.id),
        starttime:     copenhagenTime(startdate),
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

function normalizeStats(statsRaw, homePartFK, awayPartFK) {
  if (!statsRaw) return null;
  const standings  = statsRaw.standings || statsRaw.standing || {};
  const standing   = Object.values(standings)[0];
  if (!standing) return null;
  const participants = standing.standing_participants || {};

  // standing_data er et array med { code, value }
  const partMap = {};
  for (const p of Object.values(participants)) {
    const fk   = String(p.participantFK || '');
    const data = Array.isArray(p.standing_data) ? p.standing_data : Object.values(p.standing_data || {});
    partMap[fk] = {};
    for (const d of data) {
      partMap[fk][d.code] = d.value ?? null;
    }
  }

  const h = partMap[String(homePartFK)] || {};
  const a = partMap[String(awayPartFK)] || {};
  if (!Object.keys(h).length && !Object.keys(a).length) return null;

  // enetpulse code → renderStats-nøglenavn
  const CODE_MAP = {
    'Ball Possession': 'possession',
    'Shots on Goal':   'shoton',
    'Total Shots':     'goal_attempt',
    'Corner Kicks':    'corner',
    'Fouls':           'foulcommit',
    'Offsides':        'offside',
  };

  const hStats = {}, aStats = {};
  for (const [label, code] of Object.entries(CODE_MAP)) {
    const hv = h[code];
    const av = a[code];
    // Boldbesiddelse vises med %-tegn
    const fmt = v => v == null ? null : (label === 'Ball Possession' ? v + '%' : String(v));
    if (hv != null) hStats[label] = fmt(hv);
    if (av != null) aStats[label] = fmt(av);
  }

  if (!Object.keys(hStats).length) return null;
  return [
    { team: String(homePartFK), stats: hStats },
    { team: String(awayPartFK), stats: aStats }
  ];
}

function normalizeEventDetails(raw, statsRaw, id) {
  const evObj = raw?.event || raw?.events || {};
  const ev    = Object.values(evObj)[0];
  if (!ev) return { id, error: 'Ikke fundet' };

  const { home, away } = getParticipants(ev);
  const homeApiName    = participantName(home);
  const awayApiName    = participantName(away);
  const homePartFK     = home.participantFK || home.id || '';
  const awayPartFK     = away.participantFK || away.id || '';

  function scoreFromResult(participant) {
    if (!participant.result) return 0;
    const entries = Object.values(participant.result);
    const ot = entries.find(r => r.result_code === 'ordinarytime');
    if (ot) return parseInt(ot.value) || 0;
    return parseInt(entries[0]?.value) || 0;
  }

  const homeGoals = scoreFromResult(home);
  const awayGoals = scoreFromResult(away);

  // Saml alle incidents fra begge event_participants med team-tag
  const parts = ev.event_participants ? Object.values(ev.event_participants) : [];
  const tagged = [];
  for (const part of parts) {
    const isHome = String(part.number) === '1';
    const team   = isHome ? homeApiName : awayApiName;
    const incSrc = part.incident || part.incidents || {};
    for (const inc of Object.values(incSrc)) {
      tagged.push({ ...inc, _team: team });
    }
  }

  // Grupper på enetID for at parre mål+assist og subst+subst_in
  const byEnetId = {};
  for (const inc of tagged) {
    const k = inc.enetID;
    if (!byEnetId[k]) byEnetId[k] = [];
    byEnetId[k].push(inc);
  }

  const mappedEvents = [];
  const seen = new Set();

  for (const inc of tagged) {
    const k    = inc.enetID;
    if (seen.has(k)) continue;
    seen.add(k);

    const code    = (inc.incident_code || '').toLowerCase();
    const typeFK  = String(inc.incident_typeFK || '');
    const group   = byEnetId[k] || [];
    const minute  = String(parseInt(inc.elapsed) || '') +
                    (inc.elapsed_plus && inc.elapsed_plus !== '0' ? '+' + inc.elapsed_plus : '');

    if (code === 'goal') {
      const assistInc = group.find(i => (i.incident_code || '').toLowerCase() === 'assist');
      mappedEvents.push({
        minute,
        team:   inc._team,
        player: inc.participant?.name || '',
        assist: assistInc?.participant?.name || null,
        type:   'Goal',
        detail: 'Normal Goal'
      });
    } else if (code === 'card') {
      const detail = typeFK === '15' ? 'Red Card' : typeFK === '17' ? 'Yellow Red Card' : 'Yellow Card';
      mappedEvents.push({ minute, team: inc._team, player: inc.participant?.name || '', assist: null, type: 'Card', detail });
    } else if (code === 'subst') {
      const onInc = group.find(i => (i.incident_code || '').toLowerCase() === 'subst_in');
      mappedEvents.push({
        minute,
        team:   inc._team,
        player: onInc?.participant?.name || '',
        assist: inc.participant?.name || null,
        type:   'subst',
        detail: 'Substitution'
      });
    } else if (!['assist','subst_in'].includes(code)) {
      // Log ukendte incident-typer (hjælper med at finde injury_time-format)
      console.log(`[incident-ukendt] event=${id} code=${code} typeFK=${typeFK} keys=${Object.keys(inc).join(',')} data=${JSON.stringify(inc).substring(0, 200)}`);
    }
  }

  mappedEvents.sort((a, b) => (parseInt(a.minute) || 0) - (parseInt(b.minute) || 0));

  // Startopstillinger
  // lineup_typeFK: 1=GK 2=DEF 3=MID 4=FWD (startere), 5=bænk, 7/8=ikke disp., 10=træner
  const lineup = { home: [], away: [] };
  for (const part of parts) {
    const side    = String(part.number) === '1' ? 'home' : 'away';
    const entries = part.lineup ? Object.values(part.lineup) : [];
    for (const e of entries) {
      const typeFK = parseInt(e.lineup_typeFK || 0);
      if (typeFK === 10 || typeFK === 0) continue; // spring træner og ukendte over
      const posMap = { 1: 'MV', 2: 'FB', 3: 'MF', 4: 'A' };
      lineup[side].push({
        name:    e.participant?.name || '',
        shirt:   e.shirt_number || '',
        pos:     posMap[typeFK] || '',
        enetPos: parseInt(e.enet_pos || 99),
        starter: typeFK >= 1 && typeFK <= 4,
        id:      e.participantFK || e.participant?.participantFK || e.participant?.id || ''
      });
    }
    lineup[side].sort((a, b) => {
      if (a.starter !== b.starter) return a.starter ? -1 : 1;
      return a.enetPos - b.enetPos;
    });
  }

  return {
    id:            String(ev.id),
    home:          homeApiName,
    home_kort:     '',
    away:          awayApiName,
    away_kort:     '',
    home_api:      homeApiName,
    away_api:      awayApiName,
    home_part_fk:  String(homePartFK),
    away_part_fk:  String(awayPartFK),
    tournament_fk: String(ev.tournament_stageFK || ev.tournament_templateFK || ev.tournamentFK || ''),
    homeGoals,
    awayGoals,
    starttime: copenhagenTime(ev.startdate || ''),
    status:    mapStatus(ev),
    league:    ev.tournament_stage_name || ev.tournament_name || '',
    stats:     normalizeStats(statsRaw, homePartFK, awayPartFK),
    events:    mappedEvents,
    lineup
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const username = process.env.ENETPULSE_USERNAME;
  const token    = process.env.ENETPULSE_TOKEN;
  if (!username || !token) return res.status(503).json({ error: 'enetpulse credentials ikke konfigureret' });

  const { date, ids, debug, h2h } = req.query;
  const auth = `username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;

  // ── H2H ───────────────────────────────────────────────────────
  if (h2h) {
    const { p1, p2 } = req.query;
    if (!p1 || !p2) return res.status(400).json({ error: 'Mangler p1/p2 parameter' });
    const url = `${EAPI_BASE}/event/h2h/?participant1FK=${encodeURIComponent(p1)}&participant2FK=${encodeURIComponent(p2)}&limit=5&includeVenue=yes&${auth}`;
    try {
      const r    = await fetch(url);
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { return res.status(500).json({ error: 'Ugyldig JSON fra enetpulse' }); }
      if (json.error_message || Object.keys(json).length === 0)
        return res.status(404).json({ error: json.error_message || 'Ingen H2H data' });
      return res.status(200).json({ ok: true, data: json });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

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
      if (cached) {
        const fresh = cached.map(f => ({ ...f, starttime: copenhagenTime(f.startdate) }));
        return res.status(200).json({ fixtures: fresh, fromCache: true });
      }

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
        const [detailsRaw, statsRaw] = await Promise.all([
          fetch(`${EAPI_BASE}/event/details/?id=${id}&includeIncidents=yes&includeLineups=yes&username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`).then(r => r.json()),
          fetch(`${EAPI_BASE}/standing/event_stats/?object=event&objectFK=${id}&includeStandingData=yes&includeStandingParticipants=yes&username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`).then(r => r.json()).catch(() => null)
        ]);
        if (debug === '1') {
          const evObj = detailsRaw?.event || detailsRaw?.events || {};
          const ev = Object.values(evObj)[0] || {};
          const parts = ev.event_participants ? Object.values(ev.event_participants) : [];
          return {
            id,
            raw_keys: Object.keys(detailsRaw || {}),
            participant_keys: parts.map(p => Object.keys(p)),
            formation_ids: parts.map(p => ({ number: p.number, formation_id: p.formation_id })),
          };
        }
        return normalizeEventDetails(detailsRaw, statsRaw, id);
      }));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ matches: results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Mangler date eller ids parameter' });
}
