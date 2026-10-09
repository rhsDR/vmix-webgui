import { SB_URL, SB_ANON } from './_supabase.js';

// Dynamisk @font-face-stylesheet for brugeruploadede fonte (custom_fonts-tabellen).
// Serveres som text/css på /api/custom-fonts og linkes ind i playout-grafik (master/
// secondary/fullscreen) + grafik-agentens preview, så uploadede fonte virker uden redeploy.
// Læses med anon-nøgle (custom_fonts har anon select). Kort cache så nye fonte dukker
// hurtigt op, men endpointet ikke rammes ved hver frame.

const FORMAT = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

function faceFor(row) {
  const ext = String(row.file_url || '').split('.').pop().toLowerCase().split(/[?#]/)[0];
  const fmt = FORMAT[ext] || 'woff2';
  const fam = String(row.family || '').replace(/['\\<>]/g, '').trim();
  if (!fam || !row.file_url) return '';
  const weight = Number.isFinite(+row.weight) ? +row.weight : 400;
  const style = row.style === 'italic' ? 'italic' : 'normal';
  const url = String(row.file_url).replace(/['"\\]/g, '');
  return `@font-face{font-family:'${fam}';font-style:${style};font-weight:${weight};font-display:swap;src:url('${url}') format('${fmt}');}`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  try {
    const r = await fetch(`${SB_URL}/rest/v1/custom_fonts?select=family,weight,style,file_url&order=family.asc`, {
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON },
    });
    const rows = r.ok ? await r.json() : [];
    const css = (Array.isArray(rows) ? rows : []).map(faceFor).filter(Boolean).join('\n');
    res.status(200).send('/* custom_fonts — self-service font-bibliotek */\n' + css + '\n');
  } catch (e) {
    res.status(200).send('/* custom_fonts utilgængelig: ' + String(e).replace(/\*\//g, '') + ' */\n');
  }
}
