# API-analyse — vmix-webgui/api/

## 1. Endpoints returnerer for meget data

### live-match.js — stats filtreres efter hentning
`extractStats()` (linje 65-76) filtrerer kun 6 nøgler ud af 20+ statistikker fra football-API'et. Resten hentes og smides væk.

### vmix/[id].js — settings-query henter alt, bruger ét felt
Linje 27 henter alle settings med `select=key,value`, men linje 57 bruger kun `active_sub`:
```javascript
const activeSubRow = settingsRaw.find(r => r.key === 'active_sub');
```
Skulle være: `settings?projekt_id=eq.${pid}&key=eq.active_sub&select=value`

### vmix/[id].js — kampe-felter hentes selvom projekt ikke er kampdag
Linje 23 henter 16 kampe-felter, men de bruges kun inde i `if (projekt.type === 'kampdag')` (linje 92). For andre projekttyper er det spildt båndbredde.

---

## 2. Mulighed for at slå endpoints sammen

### fixture-search.js + live-match.js
Begge endpoints:
- Kører identisk `getHoldMap()` mod Supabase
- Bruger samme `API_BASE`
- Returnerer fixture-data i samme grundstruktur

Kunne konsolideres til ét endpoint med en `?details=true` parameter.

### User-management endpoints
`invite.js`, `set-password.js` og `delete-user.js` er tre separate endpoints til brugeradministration. Kunne struktureres som:
- `POST /api/users` (opret)
- `PUT /api/users/[id]` (skift password)
- `DELETE /api/users/[id]` (slet)

### fixture-debug.js
Virker som et test/debug-endpoint der er en tynd proxy til api-sports.io. Bør enten slettes eller låses bag autentifikation.

---

## 3. Inkonsistent response-format

### Success-format varierer på tværs af alle endpoints

| Endpoint | Success-format |
|----------|---------------|
| `delete-user.js` | `{ success: true }` |
| `set-password.js` | `{ ok: true }` |
| `credits-trigger/[id].js` | `{ ok: true }` |
| `invite.js` | `{ id, email }` |
| `list-users.js` | `{ users: [...] }` |
| `live-match.js` | `{ matches: [...] }` |
| `fixture-search.js` | `{ fixtures: [...] }` |
| `vmix/[id].js` | `[{ projekt: {...}, ... }]` (array, ikke objekt!) |

### Fejl-format er ens (`{ error: 'message' }`), men HTTP-koder varierer

- Manglende parameter → `400` (fixture-search.js, live-match.js)
- Manglende API-nøgle → `503` (fixture-debug.js, live-match.js)
- Supabase-fejl → `502` (credits-trigger/[id].js) vs `500` (alle andre)

### Method Not Allowed returneres forskelligt
```javascript
// invite.js linje 4:
return res.status(405).json({ error: 'Method not allowed' });

// set-password.js linje 2:
return res.status(405).end();
```

---

## 4. Unødvendige databehandlingstrin

### Datoformatering sker server-side (fixture-search.js linje 39)
```javascript
date: d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
```
Locale-formatering er et klient-ansvar. Serveren bør returnere rå timestamp og lade klienten formatere.

### HTML genereres server-side (vmix/[id].js linje 38-43)
```javascript
.map(r => r.overskrift ? `<b>${r.overskrift.toUpperCase()}</b> &nbsp; ${r.tekst}` : r.tekst)
.join(' &nbsp; &bull; &nbsp; ')
```
Serveren genererer færdig HTML inkl. `<b>`-tags og `&bull;`-separatorer. Hvis formatet ændres kræver det et server-deploy.

### vmix/[id].js returnerer data i et nøgle-kodet format
Felter som `K1_h1_L`, `T2_ov`, `S3_n` er et legacy Google Sheets-format. Et array ville være mere fleksibelt og lettere at vedligeholde.

### live-match.js — N+1 cache-lookup
Linje 93: `cached.find(f => f.fixture.id === id)` er O(n) linear search der køres for hvert fixture-ID. Med mange fixtures i sæson-cachen er dette ineffektivt:
```javascript
// Nuværende:
const cached_f = cached.find(f => f.fixture.id === id);

// Burde være (bygget én gang uden for loop):
const cachedMap = new Map(cached.map(f => [f.fixture.id, f]));
const cached_f  = cachedMap.get(id);
```

---

## 5. Langsomme endpoints og for mange databasekald

### vmix/[id].js — 6 parallelle Supabase-kald
Linje 21-28 kører 6 queries i `Promise.all()` — det er godt. Men:
- Alle 6 kald sker uanset `projekt.type`
- Supabase-joins kunne reducere det til færre kald

### live-match.js — Supabase-kald per fixture-ID
`loadSbCache(id)` (linje 44-50) kaldes individuelt for hvert ID i loopet. Hvis 6 kampe er aktive = 6 separate Supabase-kald. Burde hente alle på én gang:
```javascript
// Nuværende: N kald
for each id → loadSbCache(id)

// Burde være: 1 kald
SELECT * FROM fixture_cache WHERE fixture_id = ANY([id1, id2, ...])
```

### getHoldMap() kaldes ved hvert request i to endpoints
Både `fixture-search.js` og `live-match.js` kalder `getHoldMap()` ved hvert eneste request. Denne data ændrer sig sjældent og burde caches på applikationsniveau eller have en TTL.

---

## 6. Generelle forbedringsmuligheder

### Cache-Control headers mangler næsten overalt
Ingen endpoints sætter `Cache-Control` undtagen `vmix/[id].js` der sætter `no-store` — i den forkerte retning for et endpoint der faktisk godt må caches kortvarigt.

| Endpoint | Burde have |
|----------|-----------|
| `fixture-search.js` | `public, max-age=3600` |
| `live-match.js` | `public, max-age=60` |
| `list-users.js` | `private, max-age=300` |
| `vmix/[id].js` | `public, max-age=10` |

### CORS er inkonsistent
CORS-header sættes på `fixture-debug.js`, `fixture-search.js`, `live-match.js` og `vmix/[id].js`, men **mangler** på `invite.js`, `delete-user.js`, `list-users.js`, `set-password.js` og `credits-trigger/[id].js`.

### User-management endpoints har ingen autentifikation
`invite.js`, `delete-user.js`, `set-password.js` og `list-users.js` bruger `SUPABASE_SERVICE_ROLE_KEY` (fuld admin-adgang) uden at verificere hvem der kalder dem. Enhver der kender URL'en kan:
- Invitere nye brugere
- Resette andres passwords
- Slette brugere
- Liste alle brugere og emails

Der mangler et JWT-tjek af at kalderen er en autentificeret admin.

### Content-Type sættes ikke eksplicit
`res.json()` sætter automatisk `application/json`, men `vmix/[id].js` bruger `res.end(buf)` med manuelt sat `Content-Type: application/json; charset=iso-8859-1`. Resten af endpoints bruger implicit UTF-8. Bør standardiseres.

---

## Prioriteret handlingsliste

| Prioritet | Problem | Fil |
|-----------|---------|-----|
| 🔴 | Ingen autentifikation på user-management | invite.js, delete-user.js, set-password.js, list-users.js |
| 🔴 | N+1 Supabase-kald for fixture-cache | live-match.js |
| 🔴 | fixture-debug.js er åben proxy uden auth | fixture-debug.js |
| 🟠 | N+1 cache-lookup (linear search) | live-match.js linje 93 |
| 🟠 | settings-query henter alt, bruger ét felt | vmix/[id].js linje 27 |
| 🟠 | Standardiser success response-format | alle endpoints |
| 🟠 | Tilføj Cache-Control headers | alle endpoints |
| 🟠 | Standardiser CORS | alle endpoints |
| 🟡 | getHoldMap() caches ikke | fixture-search.js, live-match.js |
| 🟡 | HTML genereres server-side | vmix/[id].js |
| 🟡 | Datoformatering server-side | fixture-search.js |
| 🟢 | Konsolider fixture endpoints | fixture-search.js + live-match.js |
| 🟢 | Konsolider user endpoints | invite/delete/set-password |
