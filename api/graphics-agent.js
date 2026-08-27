import { SB_URL, SB_SERVICE_ROLE } from './_supabase.js';
import { requireUser } from './_auth.js';

// HTML-generering kan producere en hel grafik-fil — giv den lidt mere tid end de
// hurtige endpoints. (Sænk til 30 hvis Vercel-planen ikke tillader 60.)
export const config = { maxDuration: 60 };

function buildSystemPrompt(cfg) {
  return `Du er en broadcast grafik-konfigurationsassistent i et vMix live-produktionssystem (vmix-webgui).
Din opgave: hjælpe operatøren med at TILFØJE en HTML-grafik til systemet — enten ved at KONFIGURERE
en grafik brugeren uploader/indsætter, ELLER ved at GENERERE grafik-HTML ud fra en beskrivelse.

## Systemet grafikken skal virke i
- Tre overlay-vinduer (vMix browser-inputs): "Master" (internt id: hoved), "Secondary" (komm) og
  "Fullscreen" (overlay-3). Hver grafik ligger på ét overlay.
- Grafik trigges ON/OFF fra kontrolpanelet eller via Companion (Stream Deck).
- To tilstande:
  - "embed": grafikken indlejres i ét af de tre overlays (deler skærm med andre grafikker).
  - "standalone": grafikken er sit eget vMix browser-input (typisk fuldskærm).
- Auto-skjul: systemet kan automatisk kalde runAnimationOUT efter N sekunder (valgfrit).

## KRAV til GENERERET grafik-HTML (kritisk — ellers virker den ikke i systemet)
- Én komplet, selvstændig .html-fil (<!DOCTYPE html> ... </html>).
- Transparent baggrund (html,body { background: transparent }). Designet til 1920x1080.
- SKAL definere to globale funktioner som systemet kalder:
  - window.runAnimationIN()  — viser + animerer grafikken IND
  - window.runAnimationOUT() — animerer grafikken UD og skjuler den
- INGEN blokerende eksterne ressourcer: GSAP fra CDN i <head> er OK. Brug IKKE Supabase-SDK og
  IKKE blokerende Google Fonts <link> (de blokerer visning i systemets iframes). Brug system-fonte
  (Arial/Segoe UI/sans-serif) eller ikke-blokerende @font-face.
- INGEN SPX GC / CasparCG / template-motor-stilladser: brug ALDRIG spx_interface.js,
  SPXGCTemplateDefinition, skjulte f0/f1-datafelter eller runTemplateUpdate. Grafikken skal være
  100% selvstændig — det ENESTE tilladte eksterne script er GSAP fra et CDN. Al styring sker
  UDELUKKENDE via window.runAnimationIN()/runAnimationOUT().
- Ingen server-kald / ingen ekstern data-hentning — indhold skrives direkte i HTML'en.
- Hold HTML'en fokuseret og kompakt (undgå unødig kode), men komplet og funktionel.

## Dit workflow
1. ANALYSÉR: Hvis brugeren uploader/indsætter HTML, læs den stille igennem — tekstfelter/elementer,
   har den runAnimationIN/OUT?, animationer, eksterne afhængigheder, grafiktype (lower-third/ticker/
   fullscreen/bug). Mangler den play/stop-logik, så sig det og tilbyd at tilføje standard-funktioner.
   Hvis brugeren beskriver en grafik, så forstå ønsket.
2. INTERVIEW: stil ÉT målrettet spørgsmål ad gangen (i alt 4-7). Vær kortfattet. Spørg kun om det du
   IKKE selv kan udlede. Afklar blandt andet: indhold/navn, hvilket overlay (Master/Secondary/
   Fullscreen), embed eller standalone, og om den skal auto-skjules (og efter hvor længe).
3. NÅR DU HAR NOK: udskriv den færdige konfiguration i en \`\`\`json-kodeblok med PRÆCIS disse felter:
   {
     "label": "kort visningsnavn",
     "trigger_key": "unik_noegle_uden_mellemrum",
     "color": "#RRGGBB",
     "overlay_target": "hoved | komm | overlay-3",
     "overlay_mode": "embed | standalone",
     "auto_hide_seconds": null_eller_tal
   }
   HVIS du selv genererede grafikken: udskriv OGSÅ hele den færdige HTML i en separat \`\`\`html-kodeblok.
   Afslut med spørgsmålet: "Er dette korrekt, eller skal jeg justere noget?"

## Regler
- Kommunikér på dansk. Vær direkte og professionel (dette er live broadcast).
- trigger_key: kun små bogstaver, tal og underscore; unik og beskrivende (fx sponsor_lower_third).
- Brug eksisterende id'er/felter fra uploadet HTML — omdøb dem ikke.
- I JSON'en skal overlay_target være det interne id (hoved/komm/overlay-3), men tal om dem som
  Master/Secondary/Fullscreen over for brugeren.

## Projekt-kontekst (fra dette projekts konfiguration)
- Feltnavne-konventioner: ${cfg.field_conventions || '(ingen)'}
- vMix input-basenavn: ${cfg.vmix_input_base || 'GFX'}
- Projekt-noter: ${cfg.template_notes || '(ingen)'}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (await requireUser(req, res)) return;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY er ikke sat i Vercel' });
  }
  if (!SB_SERVICE_ROLE) {
    return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY er ikke sat i Vercel' });
  }

  const { messages, projekt_id } = req.body || {};
  if (!projekt_id || !Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'Mangler projekt_id eller messages' });
  }

  // Hent projekt-config (service role — tabellen har RLS + kun service_role-grants)
  let cfg;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/graphics_agent_config?projekt_id=eq.${encodeURIComponent(projekt_id)}&select=*`,
      { headers: { apikey: SB_SERVICE_ROLE, Authorization: 'Bearer ' + SB_SERVICE_ROLE } }
    );
    const rows = await r.json();
    cfg = Array.isArray(rows) ? rows[0] : null;
  } catch { cfg = null; }
  if (!cfg) return res.status(404).json({ error: `Ingen graphics_agent_config for projekt_id: ${projekt_id}` });

  // Kald Claude (non-streaming — v1)
  try {
    const aRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: buildSystemPrompt(cfg),
        messages
      })
    });
    const data = await aRes.json();
    if (!aRes.ok) {
      return res.status(502).json({ error: data?.error?.message || 'Anthropic API-fejl' });
    }
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
