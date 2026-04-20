const SB_URL  = 'https://rxzxdcweqpbnvfkpnnrn.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4enhkY3dlcXBibnZma3BubnJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzYzMTUsImV4cCI6MjA5MDgxMjMxNX0.e6DtMVskOwcMyJBFJDIEYsSZC0HAcD7AhNcg5PvlArU';
const HEADERS = {
  'apikey': SB_ANON,
  'Authorization': 'Bearer ' + SB_ANON
};


async function sbGet(path) {
  const res = await fetch(SB_URL + '/rest/v1/' + path, { headers: HEADERS });
  if (!res.ok) throw new Error('Supabase fejl: ' + res.status);
  return res.json();
}

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'projekt id mangler' });

  try {
    const pid = encodeURIComponent(id);

    const [projektRaw, kampeRaw, subsRaw, vmixCallsRaw, tickersRaw, settingsRaw] = await Promise.all([
      sbGet('projekter?id=eq.' + pid + '&select=navn,type,undertitel&limit=1'),
      sbGet('kampe?projekt_id=eq.' + pid + '&select=slot,hold1_lang,hold1_kort,hold1_score,hold2_score,hold2_kort,hold2_lang,kommentator,lokation,vmixcall,on_air,last_card_type,last_card_player,last_card_min,last_card_team_kort,status_short,status_elapsed&order=slot.asc'),
      sbGet('subs?projekt_id=eq.' + pid + '&select=slot,navn,titel&order=slot.asc'),
      sbGet('vmix_calls?projekt_id=eq.' + pid + '&select=slot,navn,titel,link&order=slot.asc'),
      sbGet('tickers?projekt_id=eq.' + pid + '&select=slot,overskrift,tekst,on_air,breaking&order=slot.asc'),
      sbGet('settings?projekt_id=eq.' + pid + '&select=key,value')
    ]);

    if (!projektRaw[0]) return res.status(404).json({ error: 'Projekt ikke fundet' });
    const projekt = projektRaw[0];

    // Byg ticker-strenge — kun ON AIR
    const tickerSep  = ' &nbsp; &bull; &nbsp; ';
    const tickerTail = ' &nbsp; &bull; &nbsp; ';
    const tickerBreaking = tickersRaw
      .filter(r => r.on_air && r.breaking && (r.overskrift || r.tekst))
      .map(r => r.overskrift ? `<b>${r.overskrift.toUpperCase() || ''}</b> &nbsp; ${r.tekst || ''}` : r.tekst || '')
      .join(tickerSep);
    const tickerNormal = tickersRaw
      .filter(r => r.on_air && !r.breaking && (r.overskrift || r.tekst))
      .map(r => r.overskrift ? `<b>${r.overskrift.toUpperCase() || ''}</b> &nbsp; ${r.tekst || ''}` : r.tekst || '')
      .join(tickerSep);

    const addTail = s => s ? s + tickerTail : s;

    // Individuelle ticker-felter (til Sheets)
    const tickers = {};
    tickersRaw.forEach(r => {
      tickers[`T${r.slot}_ov`]  = r.overskrift || '';
      tickers[`T${r.slot}_txt`] = r.tekst      || '';
      tickers[`T${r.slot}_air`] = r.on_air     || false;
      tickers[`T${r.slot}_brk`] = r.breaking   || false;
    });

    // Aktiv sub
    const activeSubRow = settingsRaw.find(r => r.key === 'active_sub');
    const activeSubSlot = activeSubRow ? parseInt(activeSubRow.value) || 0 : 0;
    const activeSubData = subsRaw.find(r => r.slot === activeSubSlot);

    // Byg subs som navngivne objekter S1_n, S1_t osv.
    const subs = {};
    subsRaw.forEach(r => {
      subs[`S${r.slot}_n`] = r.navn  || '';
      subs[`S${r.slot}_t`] = r.titel || '';
    });

    // Byg vmix calls som navngivne objekter VMC1_n osv.
    const vmixCalls = {};
    vmixCallsRaw.forEach(r => {
      vmixCalls[`VMC${r.slot}_n`] = r.navn  || '';
      vmixCalls[`VMC${r.slot}_t`] = r.titel || '';
      vmixCalls[`VMC${r.slot}_l`] = r.link  || '';
    });

    const json = {
      projekt: {
        navn:      projekt.navn,
        undertitel: projekt.undertitel || ''
      },
      ticker_breaking: addTail(tickerBreaking),
      ticker_normal:   addTail(tickerNormal),
      sub_aktiv_slot:  activeSubSlot,
      sub_aktiv_n:     activeSubData ? (activeSubData.navn  || '') : '',
      sub_aktiv_t:     activeSubData ? (activeSubData.titel || '') : '',
      ...subs,
      ...vmixCalls,
      ...tickers
    };

    // Kampe — kun kampdag
    if (projekt.type === 'kampdag') {
      kampeRaw
        .filter(r => r.hold1_lang || r.hold2_lang)
        .forEach(r => {
          const s = r.slot;
          const h1 = r.hold1_kort || r.hold1_lang || '';
          const h2 = r.hold2_kort || r.hold2_lang || '';
          json[`K${s}_h1_L`]  = r.hold1_lang  || '';
          json[`K${s}_h1_K`]  = r.hold1_kort  || '';
          json[`K${s}_h1_S`]  = r.hold1_score || 0;
          json[`K${s}_h2_S`]  = r.hold2_score || 0;
          json[`K${s}_h2_K`]  = r.hold2_kort  || '';
          json[`K${s}_h2_L`]  = r.hold2_lang  || '';
          json[`K${s}_kom`]   = r.kommentator || '';
          json[`K${s}_lok`]   = r.lokation    || '';
          json[`K${s}_vmc`]   = r.vmixcall    || '';
          json[`K${s}_oA`]       = r.on_air             || false;
          json[`K${s}_samf`]     = r.on_air && h1 && h2 ? `${h1} ${r.hold1_score || 0} - ${r.hold2_score || 0} ${h2}` : '';
          json[`K${s}_card_t`]   = r.last_card_type      || '';
          json[`K${s}_card_p`]   = r.last_card_player     || '';
          json[`K${s}_card_min`] = r.last_card_min        || '';
          json[`K${s}_card_tm`]  = r.last_card_team_kort  || '';
          json[`K${s}_status`]   = r.status_short         || '';
          json[`K${s}_elapsed`]  = r.status_elapsed       ?? 0;
        });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=iso-8859-1');
    const buf = Buffer.from(JSON.stringify([json]), 'latin1');
    return res.status(200).end(buf);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
