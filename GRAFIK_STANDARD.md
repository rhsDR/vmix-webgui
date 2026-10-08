# Grafik-standard — vmix-webgui

Dette er den autoritative standard for AL HTML-grafik i systemet — både hånd-lavet og AI-genereret
(Grafik-agenten). Mål: grafik der afvikler **broadcast-sikkert og glat i vMix**, på niveau med
professionelle broadcast-grafikværktøjer. (Vi bruger IKKE SPX/CasparCG — grafik er selvstændig HTML
styret direkte af systemet; se §1 + §9.)

> Tommelfinger: **test ALTID i vMix, ikke kun i en browser.** vMix fanger frames — ting der ser
> glat ud i Chrome kan hakke i vMix. En grafik er ikke færdig før den er verificeret i vMix.

---

## 0. Arkitektur-princip (afvikling)
Grafik afvikles som **ÉT samlet output pr. PGM-signal** — alle lag komponeres i én browser source
(`master.html` for hoved-overlayet; `secondary.html`/`fullscreen.html` er egne outputs KUN fordi de
går til andre signaler). Vi fragmenterer **ikke** grafik til ét output pr. element.

Konsekvens: ét samlet output = **én delt renderer-hovedtråd**. Derfor er compositor-ren animation
(§2) ikke valgfri — det er dét der holder flere *samtidige* grafikker glatte i samme output:
- **Kontinuerlig/samtidig bevægelse** (ticker, rul, score der cykler mens andet kører) → CSS-
  compositor (`transform`/`opacity`), ALDRIG per-frame hovedtråds-drivning (rAF/GSAP-tween).
- **Diskrete ind/ud-reveals** → GSAP (industristandard) er fint, hvis det kun er transform/opacity
  og kortvarigt.

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

## 6. Fonte (frit valg — men self-hostet)
Du må bruge ENHVER font. Den skal bare **self-hostes** — aldrig et blokerende CDN-`<link>` (Google
Fonts), som fejler på et låst netværk.
- **Font-bibliotek:** `/fonts/` (woff2) + `/fonts.css` (`@font-face`). Tilføj en font = læg woff2 i
  `/fonts/` + én `@font-face`-linje i `/fonts.css`. Så er den tilgængelig for alle grafikker.
- **Indbyggede grafikker** (Vercel-origin): `<link href="/fonts.css">`.
- **Agent/custom-grafikker** (blob/Supabase-origin): master.html injicerer automatisk `/fonts.css`
  (crossorigin) → brug bare fontens family-navn. Alternativt embed fonten som base64 `@font-face` i
  selve grafikken (fuldt selvstændig), eller brug system-fonte (Arial/Segoe UI).
- **ALDRIG** et Google Fonts/CDN-`<link>` (blokerer visning + fejler offline/på låst netværk).
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

## 11. Review-checkliste (hånd-lavet grafik)
Agent-grafik tjekkes automatisk af validatoren. Grafik lavet eller ændret **i hånden** køres igennem
denne liste før brug:
- [ ] Transparent baggrund (`html,body{background:transparent}`)
- [ ] `window.runAnimationIN()` + `window.runAnimationOUT()` findes og virker
- [ ] Starter skjult (ingen flash før IN)
- [ ] Kontinuerlig bevægelse = CSS `@keyframes`/transition på `transform` — INGEN `requestAnimationFrame`-scroll
- [ ] GSAP kun til korte diskrete reveals (transform/opacity), ikke til kontinuerlig/gentagende bevægelse
- [ ] INGEN `var()`/`calc(var())` i en animations-værdi
- [ ] Ingen blokerende CDN (Google Fonts-`<link>`, Supabase-SDK); fonte self-hostet/`@font-face`
- [ ] Ingen SPX-stillads (`spx_interface.js`, `SPXGCTemplateDefinition`, `f0/f1`)
- [ ] 1920×1080; vigtigt indhold inden for title-safe (~5%)
- [ ] Live-data via `window.__API_ORIGIN`/`__PROJEKT_ID`; demo-data når `window.__IS_PREVIEW`
- [ ] **TESTET I vMix** — glat IN/OUT/opdatering mens andre overlays kører (ikke kun i browser)

---
*Grafik-agentens system-prompt (`api/graphics-agent.js`) og validatoren (`_gaValidateHtml` i
`js/app-graphics-agent.js`) håndhæver §0/§2 + §7-9 automatisk. Checklisten (§11) er den manuelle
udgave af samme regler til hånd-lavet grafik.*
