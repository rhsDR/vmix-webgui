# Kodeanalyse 2 — admin.html, credits.html, score_cycle.js, api/*

Ingen ændringer er foretaget. Kun observationer.

---

## admin.html

### 1) Duplikeret kode

**Projekter hentes to gange ved opstart**
`loadApiUrls()` og `loadJsonRef()` kalder begge Supabase på næsten identisk vis:
```js
// loadJsonRef (linje 554):
fetch(SB_URL + '/rest/v1/projekter?select=id,navn,type&order=orden.asc', { headers: sbHeaders() })

// loadApiUrls (linje 656):
fetch(SB_URL + '/rest/v1/projekter?select=id,navn,undertitel&order=orden.asc', { headers: sbHeaders() })
```
De to kald henter lidt forskelligt select-indhold (`type` vs. `undertitel`). Begge køres ved `init()`. Ét samlet kald med `select=id,navn,type,undertitel` ville eliminere den dobbelte round-trip.

**Hardkodet URL-rod to steder**
Strengen `https://vmix-control.vercel.app/api/vmix/` optræder på linje 560 (i `loadJsonRef`) og linje 662 (i `loadApiUrls`). Ingen fælles konstant.

**`esc()` defineret lokalt og identisk med app.js**
Linje 797–799 definerer `esc(s)` på præcis samme måde som i app.js. Funktionen er kopieret og vedligeholdes separat.

### 2) Inkonsistent fetch() vs. sbClient

Admin-siden bruger `fetch()` direkte til Supabase REST i tre funktioner:
- `loadJsonRef()` — GET projekter
- `loadApiUrls()` — GET projekter
- `toggleRole()` — PATCH og POST på `user_roles`

`sbClient` bruges korrekt til Realtime i `startPresence()`. Der er ingen wrapper-funktioner i admin.html, og det er forventeligt da siden er standalone. Men `toggleRole()` opbygger headers manuelt med `{ ...sbHeaders(), 'Prefer': '...' }` — inkonsistent med de to andre der blot bruger `{ headers: sbHeaders() }`.

### 3) Fejl der sluges

Ingen tomme catch-blokke. Men `loadApiUrls()` og `loadJsonRef()` har slet ingen `try/catch` — netværksfejl ville kaste ukontrolleret og efterlade UI i loading-tilstand uden fejlbesked.

### 4) Ubrugte funktioner

Ingen ubrugte funktioner fundet.

### 5) Generelle forbedringsmuligheder

- **Inline `onclick` linje 668**: `onclick="copyText('${url}')"` er inkonsistent med resten af siden der bruger `addEventListener`. Hvis URL indeholder et enkelt-anførselstegn (sjældent men muligt) ville det brekke.
- **`toggleRole()` laver to separate if/else-grene** med næsten identiske fetch-kald — kun method og body er forskellig. Kunne kondenseres.
- **Manglende try/catch i loadApiUrls og loadJsonRef** — se punkt 3.

---

## credits.html

### 1) Duplikeret kode

**`pidFilter` beregnes identisk tre steder**
```js
const pidFilter = projektId ? '&projekt_id=eq.' + projektId : '';
```
Denne linje er kopieret ordret i:
- `pollTrigger()` (linje 108)
- `loadCredits()` (linje 127)
- `resetTrigger()` (linje 185)

`projektId` er en top-level konstant og ændrer sig aldrig. `pidFilter` burde også være det.

### 2) Inkonsistent fetch() vs. sbClient

`credits.html` er en standalone broadcast-overlay uden auth og bruger konsekvent `fetch()` direkte med hardkodede `SB_URL`/`SB_ANON`/`SB_HEADERS` øverst i scriptet. Det er bevidst og internt konsistent.

### 3) Fejl der sluges

**`pollTrigger()` — linje 114**
```js
} catch {}
```
Fejl ved trigger-polling sluges helt stille — ingen log, ingen retry-logik. Polling stopper ved fejl da `setTimeout(pollTrigger, 2000)` sidder efter `catch`-blokken og stadig kørers.

### 4) Ubrugte funktioner

Ingen ubrugte funktioner fundet.

### 5) Generelle forbedringsmuligheder

- `pidFilter` som top-level konstant ville fjerne tre identiske beregninger.
- Der er ingen Realtime-subscription i credits.html — siden poller med 2000 ms interval. Det er en bevidst arkitekturvalg (overlay behøver ikke SDK-overhead), men pollingen stopper ikke ved tab-/vindueskontekstskifte.

---

## score_cycle.js

### 1) Duplikeret kode

**`applyOut` og `applyInStart` er næsten spejlbilleder**
Begge sætter `el.style.opacity = '0'` og tildeler en `transform` baseret på transition-type, men med inverterede retninger. De er intentionelt symmetriske, men deler en logisk struktur der let kan divergere ved fremtidige ændringer (fx en ny transition-type der kun tilføjes ét sted).

### 2) Inkonsistent fetch() vs. sbClient

`score_cycle.js` er en SPX-plugin der kørers uden for projektkonteksten. Den bruger `fetch()` direkte — korrekt og forventet.

### 3) Fejl der sluges

`fetchData()` (linje 82–84) logger til `console.warn` — ikke stille. Acceptabelt for en plugin.

### 4) Ubrugte funktioner

`var cycleTimer` sættes til `null` i `stopCycle()` men testes korrekt i samme funktion — ingen leak. Ingen ubrugte funktioner.

### 5) Generelle forbedringsmuligheder

- Bruger `var` i stedet for `const`/`let` gennemgående — gammel stil, men konsistent inden i IIFE.
- `estimateInDuration()` forsøger at måle IN-animationens varighed via computed style på template-elementer. Dette kan give unpræcise resultater hvis elementer har CSS transitions sat via klasser der endnu ikke er aktive.

---

## api/live-match.js

### 1) Duplikeret kode

**`getHoldMap()` og `mapHold()` er kopieret fra `fixture-search.js`**
De to funktioner er næsten identiske, men med én subtil forskel i `mapHold()`:
- `live-match.js`: `return { lang: apiName, kort: null }` for ukendte hold
- `fixture-search.js`: `return { lang: apiName, kort: apiName.substring(0, 3).toUpperCase() }` for ukendte hold

Det betyder at live-dashboardet og fixture-søgningen kan returnere forskellig `kort`-værdi for samme hold hvis det ikke findes i databasen.

**`loadCachedEvents()` og `loadCachedStats()` er næsten identiske**
```js
function loadCachedEvents(id) {
  try {
    const fp   = path.join(process.cwd(), 'api', 'data', `events_${id}.json`);
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return Array.isArray(data.response) ? data : null;
  } catch { return null; }
}

function loadCachedStats(id) {
  try {
    const fp   = path.join(process.cwd(), 'api', 'data', `stats_${id}.json`);
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return Array.isArray(data.response) ? data : null;
  } catch { return null; }
}
```
Eneste forskel er filnavnet. Én funktion `loadCachedFile(filename)` ville dække begge.

### 2) Inkonsistent fetch() vs. sbClient

Alle API-filer bruger `fetch()` direkte — korrekt for server-side Node.js Vercel-handlers.

### 3) Fejl der sluges

- `getHoldMap()` (linje 15): `} catch { return {}; }` — fejl ved Supabase-opslag sluges, holdMap returneres tom.
- `loadCachedEvents/Stats`: `} catch { return null; }` — cache-misses er acceptable null-returns.
- Fetch-fejl i Promise.all: `.catch(() => ({ response: [] }))` — fornuftige fallback-værdier.

### 4) Ubrugte funktioner

Ingen.

### 5) Generelle forbedringsmuligheder

- `SB_URL` og `SB_ANON` er kopieret i `live-match.js`, `fixture-search.js`, `vmix/[id].js` og `credits-trigger/[id].js`. En delt konstant-fil ville undgå at den samme ANON-nøgle vedligeholdes fire steder.

---

## api/fixture-search.js

### 1) Duplikeret kode

Se live-match.js — `getHoldMap()` og `mapHold()` er kopieret herfra med subtil divergens.

`loadCache(filename)` i denne fil er en renere, generaliseret version end live-match.js's to separate cache-funktioner — men de er ikke delt.

### 2) Inkonsistent fetch() vs. sbClient

Konsistent direkte fetch — korrekt for server-side.

### 3) Fejl der sluges

- `getHoldMap()` (linje 20): `} catch { return {}; }` — identisk med live-match.js.
- `loadCache()`: `} catch { return null; }` — OK.

### 4) Ubrugte funktioner

Ingen.

### 5) Generelle forbedringsmuligheder

Ingen ud over det delte duplikeringsproblem med live-match.js.

---

## api/vmix/[id].js

### 1) Duplikeret kode

**`tickerBreaking` og `tickerNormal` bygges med næsten identisk kode**
```js
const tickerBreaking = tickersRaw
  .filter(r => r.on_air && r.breaking && ...)
  .map(r => r.overskrift ? `<b>...</b> &nbsp; ${...}` : ...)
  .join(tickerSep);

const tickerNormal = tickersRaw
  .filter(r => r.on_air && !r.breaking && ...)
  .map(r => r.overskrift ? `<b>...</b> &nbsp; ${...}` : ...)
  .join(tickerSep);
```
Eneste forskel er `r.breaking` vs. `!r.breaking` i filter. `.map()`-logikken er identisk.

### 2) Inkonsistent fetch() vs. sbClient

Konsistent — bruger en lokal `sbGet()` wrapper.

### 3) Fejl der sluges

Ingen tomme catch-blokke. Fejl propagerer til den ydre try/catch der returnerer HTTP 500.

### 4) Ubrugte funktioner

**`dkEncode()` gør ingenting (linje 8–10)**
```js
function dkEncode(str) {
  return str || '';
}
```
Funktionen hedder `dkEncode` men udfører ingen encoding — den returnerer blot strengen uændret eller tom streng. Sandsynligvis en relikt fra en plan om ISO-8859-1 encoding. Den er brugt gennemgående i ticker-streng-bygning, men er et no-op.

### 5) Generelle forbedringsmuligheder

- `encodeURIComponent(id)` bruges på linje 24 til at sikre Supabase-forespørgsler — god praksis, men ingen af de andre API-filer gør det samme.
- Korrekt at svaret pakkes som `[json]` (array) i latin1-buffer — bevidst for kompatibilitet med ældre SPX-templates.

---

## api/credits-trigger/[id].js

### 1) Duplikeret kode

`SB_URL`, `SB_ANON` og `HEADERS` er igen defineret lokalt — se kommentar under live-match.js.

### 2) Inkonsistent fetch() vs. sbClient

Direkte fetch — korrekt.

### 3) Fejl der sluges

Ingen try/catch om fetch-kaldet. Uventet undtagelse ville resultere i ukontrolleret server-fejl uden nyttigt svar.

### 4) Ubrugte funktioner

Ingen.

### 5) Generelle forbedringsmuligheder

Supabase PATCH returnerer HTTP 200 selv hvis ingen rækker matcher (projekt_id eksisterer ikke). Der er ingen validering af om opdateringen faktisk ændrede noget — kaldet lykkes "stille" selv ved forkert projekt-id.

---

## api/invite.js og api/set-password.js

### 1) Duplikeret kode

Defaultkoden `'DR35203040'` er hardkodet i **begge filer**:
- `invite.js` (linje 37): `body: JSON.stringify({ password: 'DR35203040' })`
- `set-password.js` (linje 11): `const DEFAULT_PASSWORD = 'DR35203040';`

`invite.js` bruger den inline uden konstant, `set-password.js` sætter den i en konstant. En ændring af defaultkoden kræver at begge filer opdateres.

### 2–4) Ingen øvrige fund

Begge filer har korrekt fejlhåndtering og ingen tomme catch-blokke.

---

## api/fixture-debug.js

### 5) Generelle forbedringsmuligheder

Ingen try/catch om fetch-kaldet — et netværksproblem ville kaste ukontrolleret. Da dette er et debug-endpoint er det acceptabelt, men det bør ikke eksponeres i produktion uden autentificering.

---

## Tværgående fund

| Problem | Steder |
|---|---|
| `SB_URL` + `SB_ANON` hardkodet | live-match.js, fixture-search.js, vmix/[id].js, credits-trigger/[id].js, credits.html |
| `getHoldMap()` + `mapHold()` duplikeret med divergerende adfærd | live-match.js vs. fixture-search.js |
| `esc()` defineret lokalt i to HTML-filer | admin.html + app.js |
| Hardkodet default-password | invite.js + set-password.js |
| Projekter hentet to gange ved admin-opstart | loadApiUrls() + loadJsonRef() i admin.html |
