# Grafik-standard — vmix-webgui

Dette er den autoritative standard for AL HTML-grafik i systemet — både hånd-lavet og AI-genereret
(Grafik-agenten). Mål: grafik der afvikler **broadcast-sikkert og glat i vMix**, på niveau med
professionelle broadcast-grafikværktøjer. (Vi bruger IKKE SPX/CasparCG — grafik er selvstændig HTML
styret direkte af systemet; se §1 + §9.)

> Tommelfinger: **test ALTID i vMix, ikke kun i en browser.** vMix fanger frames — ting der ser
> glat ud i Chrome kan hakke i vMix. En grafik er ikke færdig før den er verificeret i vMix.

---

## 1. Lifecycle-kontrakt (systemets egen — IKKE SPX)
Hver grafik SKAL eksponere disse to globale funktioner (master.html/systemet kalder dem):
- `window.runAnimationIN()` — vis + animér IND.
- `window.runAnimationOUT()` — animér UD og skjul til sidst.
- Styring sker UDELUKKENDE via disse to funktioner. Byg IKKE egen auto-hide-timer — systemet styrer
  auto-skjul via `auto_hide_seconds`. Dynamisk indhold opdateres via live-data (§8) — IKKE via
  eksterne template-motorer (SPX/CasparCG o.l.).

## 2. Animation & ydelse (KRITISK — den hyppigste fejlkilde)
vMix-grafik kører som browser source der fanger frames i fast takt. Alt per-frame hovedtråds-
arbejde der forsinker et frame = synligt hak/frys. Derfor:
- **Animér KUN `transform` og `opacity`** til alt der skal være glat → kan køre på compositor-
  tråden, uafhængigt af hovedtråden.
- **UNDGÅ at animere** `clip-path`, `width`, `height`, `top`, `left`, `margin`, `box-shadow`,
  `filter`, `background-position` → gen-tegnes på hovedtråden hver frame og kan stalle hele kilden.
  (Solid ensfarvet bar + kort clip-path er acceptabelt; store/komplekse lag er ikke.)
- **Kontinuerlig bevægelse (ticker, credits-rul)** = CSS `@keyframes`/`transition` på `transform` —
  ALDRIG en `requestAnimationFrame`-løkke der sætter position i JS hver frame.
- **ALDRIG `var()`/`calc(var(...))` i en animations-værdi** (fx `translateX(var(--x))`) — det slår
  compositing fra, så animationen falder tilbage på hovedtråden. Bag den konkrete px-værdi ind.
- Foretræk **CSS-transition/@keyframes frem for GSAP** i dette miljø: GSAP driver fra JS på
  hovedtråden hver frame (rAF) og kan stalle vMix' frame-produktion når flere overlays deler tråd.
  GSAP er OK til KORT, let transform/opacity — men aldrig til kontinuerlig bevægelse.
- `will-change: transform` (/`opacity`) på det element der animeres kontinuerligt.
- Start altid i skjult/forskudt tilstand, så grafikken ikke "blinker" før `runAnimationIN`.

## 3. Canvas & opløsning
- Én selvstændig `.html`-fil, designet til **1920×1080**.
- `html,body { background: transparent; margin:0; overflow:hidden }`.
- Ingen skalering afhængig af vindue — fast 1920×1080-layout.

## 4. Safe areas / title-safe
- Hold vigtig tekst/logoer inden for **title-safe (ca. 5% margin = ~90×50px)** og grafik inden for
  **action-safe (~3,5%)**. Intet læsbart indhold helt ude i kanten.

## 5. Farver & kontrast
- Broadcast-venligt: undgå rene super-whites til store flader (brug fx `#f0f0f0` frem for `#ffffff`
  til bund-fyld); undgå fuldmættede farver der "bløder" på SDI.
- Sørg for læsbar kontrast mellem tekst og baggrund (skygge/plade bag tekst over levende video).

## 6. Fonte
- Brug **embeddede/self-hostede fonte** (`@font-face` med lokal/base64-kilde) eller system-fonte
  (Arial/Segoe UI). Ingen **blokerende** `<link>` til Google Fonts — de forsinker/blokerer visning i
  iframes og kræver internet.
- Mål tekstbredde FØRST når fonten er klar (`document.fonts.ready`) hvis layout afhænger af den.

## 7. Afhængigheder (offline-sikkerhed)
- **Ingen blokerende eksterne scripts/links i `<head>`.** Ingen Supabase-SDK i indlejrede grafikker
  (systemet injicerer data), ingen blokerende Google Fonts.
- Hvis et bibliotek skal bruges, **self-host det** (ikke CDN) — grafik skal virke uden internet og
  loade deterministisk.

## 8. Live-data (hvis dynamisk)
- Hent fra `window.__API_ORIGIN + '/api/vmix/' + window.__PROJEKT_ID` (brug de injicerede globaler,
  ikke `location.origin`). Svar er et array → brug `data[0]`.
- Brug `window.__IS_PREVIEW`: true → vis demo-data, fetch IKKE. Bag pæne demo/fallback-værdier ind,
  så grafik ser rigtig ud i preview og før live-data. Blank aldrig ud til tomt.
- `ticker_normal/ticker_breaking` er færdig HTML → `innerHTML`. Navne/scores/tekst → `textContent`.

## 9. Start & afvikling
- Body starter skjult (`opacity:0` indtil IN) — ingen flash ved load.
- **Ingen template-motor-stillads overhovedet** (vi bruger ikke SPX): brug ALDRIG `spx_interface.js`,
  `SPXGCTemplateDefinition`, `runTemplateUpdate`, skjulte `f0/f1`-datafelter o.l. Grafik er 100%
  selvstændig og styres kun via §1 + §8.
- `trigger_key`: kun små bogstaver/tal/underscore, unik; aldrig en indbygget system-nøgle.

## 10. Test (Definition of Done)
1. Verificeret **i vMix** (ikke kun browser): IN, OUT, opdatering, og — vigtigst — **glat afvikling
   mens andre overlays er aktive** (fx ticker der ruller mens en anden grafik skifter).
2. Ingen blokerende CDN; loader offline.
3. Transparent baggrund; korrekt på 1920×1080; inden for safe-areas.
4. Ingen per-frame hovedtråds-animation (tjek: ingen `requestAnimationFrame`-scroll, ingen GSAP til
   kontinuerlig bevægelse, ingen `var()` i anim-værdi).

---
*Grafik-agentens system-prompt (`api/graphics-agent.js`) og validatoren (`_gaValidateHtml` i
`js/app-graphics-agent.js`) håndhæver §2 og §7-9 automatisk.*
