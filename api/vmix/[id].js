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

    const [projektRaw, kampeRaw, subsRaw, vmixCallsRaw, tickersRaw] = await Promise.all([
      sbGet('projekter?id=eq.' + pid + '&select=navn,type,undertitel&limit=1'),
      sbGet('kampe?projekt_id=eq.' + pid + '&select=slot,hold1_lang,hold1_kort,hold1_score,hold2_score,hold2_kort,hold2_lang,kommentator,lokation,vmixcall,on_air&order=slot.asc'),
      sbGet('subs?projekt_id=eq.' + pid + '&select=slot,navn,titel&order=slot.asc'),
      sbGet('vmix_calls?projekt_id=eq.' + pid + '&select=slot,navn,titel,link&order=slot.asc'),
      sbGet('tickers?projekt_id=eq.' + pid + '&select=slot,overskrift,tekst,on_air,breaking&order=slot.asc')
    ]);

    if (!projektRaw[0]) return res.status(404).json({ error: 'Projekt ikke fundet' });
    const projekt = projektRaw[0];

    const json = {
      projekt: {
        navn:      projekt.navn,
        undertitel: projekt.undertitel || ''
      },
      subs: subsRaw
        .filter(r => r.navn || r.titel)
        .map(r => ({ slot: r.slot, navn: r.navn || '', titel: r.titel || '' })),
      vmix_calls: vmixCallsRaw
        .filter(r => r.navn || r.titel || r.link)
        .map(r => ({ slot: r.slot, navn: r.navn || '', titel: r.titel || '', link: r.link || '' })),
      tickers: tickersRaw
        .filter(r => r.overskrift || r.tekst)
        .map(r => ({ slot: r.slot, overskrift: r.overskrift || '', tekst: r.tekst || '', on_air: r.on_air || false, breaking: r.breaking || false }))
    };

    if (projekt.type === 'kampdag') {
      json.kampe = kampeRaw
        .filter(r => r.hold1_lang || r.hold2_lang)
        .map(r => ({
          slot:       r.slot,
          hold1_lang: r.hold1_lang  || '',
          hold1_kort: r.hold1_kort  || '',
          hold1_score: r.hold1_score || 0,
          hold2_score: r.hold2_score || 0,
          hold2_kort: r.hold2_kort  || '',
          hold2_lang: r.hold2_lang  || '',
          kommentator: r.kommentator || '',
          lokation:   r.lokation    || '',
          vmixcall:   r.vmixcall    || '',
          on_air:     r.on_air      || false
        }));
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(json);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
