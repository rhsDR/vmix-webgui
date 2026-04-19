# Kodeanalyse — app.js

Ingen ændringer er foretaget. Kun observationer.

---

## 1) fetch() og sbClient bruges blandet til samme formål

Der er fire hjælpefunktioner til Supabase REST (`sbGet`, `sbPost`, `sbPatch`, `sbDelete`), men to steder bruges `fetch()` direkte til det samme API i stedet:

### A) `addStamdataItem` — linje 330–334
```js
await fetch(SB_URL + '/rest/v1/dropdowns', {
  method: 'POST',
  headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
  body: JSON.stringify(body)
});
```
`sbPost('dropdowns', body)` eksisterer og gør præcis det samme. Denne funktion er den eneste der ikke bruger wrapperen — sandsynligvis opstået fordi `sbPost` blev tilføjet efter at `addStamdataItem` var skrevet.

### B) `init()` — linje 1508–1533
```js
fetch(SB_URL + '/rest/v1/projekter?id=eq.' + aktivProjektId + '&select=undertitel,type', { headers: SB_HEADERS })
  .then(r => r.json())
  .then(rows => { ... })
  .catch(() => {});
```
Kunne erstattes af `sbGet('projekter?...')`. Bruger bevidst `.then()/.catch()` i stedet for `await` for ikke at blokere `init()` — det er et gyldigt mønster, men inkonsistent med resten af koden.

### Ikke problematisk (korrekt brug)
- `fetch('/api/fixture-search?...')` i `searchFixtureByDate` (linje 711) — kalder en lokal Vercel-endpoint, ikke Supabase.
- `fetch('/api/live-match?...')` i `fetchLiveMatches` (linje 1615) — samme, lokal endpoint.
- `sbClient.channel(...)` bruges kun til Realtime/presence — korrekt, ingen REST-overlap.

---

## 2) Fejl der sluges med tom .catch(() => {})

### A) Projekt-undertitel, `init()` — linje 1533
```js
.catch(() => {});
```
Fejl ved hentning af projektnavn og -type sluges fuldstændigt. Hvis kaldet fejler, sættes `projektType` aldrig, og faner skjules ikke korrekt for TV-projekter. Ingen brugerbesked, ingen log.

### B) Kortskrivning til Supabase, `fetchLiveMatches` — linje 1649
```js
await sbPatch('kampe?...', { last_card_type: ..., ... }).catch(() => {});
```
Fejl ved automatisk kortregistrering sluges. Kortet ses i dashboardet, men gemmes ikke i databasen. Brugeren ved ikke om det.

### C) Statusopdatering til Supabase, `fetchLiveMatches` — linje 1661
```js
await sbPatch('kampe?...', { status_short: ..., status_elapsed: ... }).catch(() => {});
```
Fejl ved automatisk kampstatus-opdatering sluges stille. Samme problem som B.

### D) `refreshCredits` — linje 1250
```js
} catch { /* stille */ }
```
Fejl ved hentning af credits-data sluges med en kommentar om at det er bevidst. `renderCredits()` kørers alligevel med gammel eller tom data — kan resultere i, at brugeren ser forældet indhold uden fejlbesked.

---

## 3) Kode der gør det samme to steder

### A) `loadStamdata()` er defineret men aldrig kaldt — linje 215–227
```js
async function loadStamdata() {
  const rows = await sbGet('dropdowns?select=*&order=orden.asc');
  stamdataRaw = rows;
  renderStamdataSection('kommentator', ...);
  renderStamdataSection('hold', ...);
  renderStamdataSection('lokation', ...);
}
```
I `init()` (linje 1571–1574) sker præcis det samme manuelt:
```js
stamdataRaw = await sbGet('dropdowns?select=*&order=orden.asc');
renderStamdataSection('kommentator', ...);
renderStamdataSection('hold', ...);
renderStamdataSection('lokation', ...);
```
`loadStamdata()` er altså en ubrugt funktion der duplikerer kode fra `init()`. Den kan enten fjernes, eller `init()` kan kalde den i stedet.

### B) Buffer-initialisering kopieret i `enterEdit` og `toggleAutoMode` — linje 676–683 og 700
Identisk kode to steder:
```js
k.buf = {
  hold1Lang: k.hold1Lang, hold2Lang: k.hold2Lang,
  kommentator: k.kommentator, lokation: k.lokation,
  vmixcall: k.vmixcall, lokSomKomm: false
};
```
`enterEdit(i)` og den automatiske `toggleAutoMode(i)` (grenen `if (newMode)`) initialiserer bufferen på nøjagtig samme måde.

### C) Flash-saved animation duplikeret i `saveSubRow` og `saveVmixCallRow` — linje 1183–1184 og 1200–1201
```js
el.classList.add('flash-saved');
el.addEventListener('animationend', () => el.classList.remove('flash-saved'), { once: true });
```
Identiske to linjer i begge gem-funktioner.

### D) Tre renderStamdataSection-kald sker på tre steder
De tre `renderStamdataSection`-kald (kommentator/hold/lokation) forekommer i:
1. `loadStamdata()` — linje 218–226 (aldrig kaldt, se A)
2. `refreshDropdowns()` — linje 346–348
3. `init()` direkte — linje 1572–1574

`refreshDropdowns()` og `init()` kalder begge `sbGet('dropdowns?...')` og renderer alle tre sektioner. Den eneste forskel er at `refreshDropdowns()` også opdaterer den globale `dropdowns`-variabel. Kaldet i `init()` kunne erstattes af et kald til `refreshDropdowns()`.

### E) Tovejs vmixcall-synkronisering (ikke fejl, men værd at bemærke)
- `saveKamp()` (linje 800–804): Gem kamp → opdaterer `vmix_calls`-slot med det samme link.
- `saveVmixCallRow()` (linje 1203–1207): Gem vmix_calls → opdaterer `kampe`-slot med det samme link.

Den samme synkroniseringslogik er implementeret i begge retninger. Det er sandsynligvis intentionelt, men kan forårsage dobbelt-skrivning og er svær at vedligeholde hvis felter ændres.
