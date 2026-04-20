# Analyse af spx-editor.html

## 1. DUPLIKERET KODE

### Binding-funktioner gentages i flere varianter
Linjer **1112-1113**, **2066**, **2692-2694**:
```javascript
// Version 1 (linje 1112):
const cb=(id,fn)=>{const inp=document.getElementById(id);if(inp)inp.addEventListener('input',e=>{fn(e.target.value);render();renderPanel();});};
// Version 2 (linje 2066):
const scBind=(id,key,isNum)=>{const el=document.getElementById(id);if(el)el.addEventListener('input',e=>{scoreCycleSettings[key]=...});};
// Version 3 (linje 2692):
const cbs=(id,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener('change',e=>{saveState();fn(e.target.value);...});};
```
Samme mønster (find element → bind event → kald callback → gem state) er kopieret og modificeret mindst 3 gange.

### Duplikerede API-felts-indsæt funktioner
- `apiFieldInsert()` — linje **1228**
- `canvasApiFieldInsert()` — linje **1236**

Begge gør det samme: indsætter `{key}` i et input-felt ved cursor-position. Kun felt-ID er forskelligt.

### Wipe direction-knapper
- `dirBtns()` i ribbon — linje **956**
- `dirBtn()` i grupper — linje **2666**

Samme logik, forskellig syntaks.

### Ticker-animation implementeret to steder
- CSS + requestAnimationFrame — linje **3268-3272**
- GSAP-eksport — linje **3379-3382**

Næsten identisk logik.

---

## 2. INKONSISTENT BRUG AF FETCH

Tre forskellige mønstre bruges på kryds og tværs uden konsistens:

```javascript
// Pattern 1 — .then().catch() (linje 1219):
fetch(url).then(r=>r.json()).then(data=>{...}).catch(()=>{toast(...)});

// Pattern 2 — async/await med try/catch (linje 2238):
const res = await fetch(url);
if (!res.ok) throw new Error('HTTP ' + res.status);
const data = await res.json();

// Pattern 3 — .then() i event listener (linje 2895):
fetch(url).then(r=>r.json()).then(data=>{...}).catch(()=>{toast(...)});
```

Der er ingen fælles `_fetchJSON(url)` wrapper — fejlhåndtering er spredt og uens.

---

## 3. SLUGTE FEJL

### Helt tom catch
Linje **3927**:
```javascript
.catch(function(){});  // fejl forsvinder sporløst
```

### Catch uden console.error
Linjerne **1225**, **2905** logger ikke til console — fejl er usynlige i Vercel logs:
```javascript
.catch(()=>{toast('Kunne ikke hente API');fetchBtn.textContent='⟳';});
```

### setInterval polling uden stop-mekanisme
Linje **3506** og **3931**:
```javascript
setInterval(fetchData, Math.max(10, cfg.refreshInterval || 60) * 1000);
setInterval(_poll, APIIVL * 1000);
```
ID gemmes ikke → polling kan ikke stoppes, fortsætter i baggrunden selvom animation er stoppet.

### iframe cleanup ikke garanteret
Linje **3945-3956**: `parseHTMLTemplate()` indsætter en iframe i DOM. Cleanup sker kun hvis intet fejler — en exception kan efterlade iframe i DOM permanent.

---

## 4. UBRUGTE FUNKTIONER

| Funktion | Linje | Bemærkning |
|----------|-------|------------|
| `loadRecentProject()` | 912 | Defineret, men kroppen gør kun `toast('Kan ikke genindlæse...')` — ingen faktisk loading |
| `setFontStyle()` | 2952 | Defineret men kaldes intet sted |

---

## 5. HALVT IMPLEMENTERET

### Score Cycle felt-sletning mangler
Linje **2069-2070** har listeners der sætter `field` og `target`, men der er ingen slet-knap. Man kan tilføje felter men ikke fjerne dem fra UI.

### Import HTML Parser håndterer kun simpel timing
Linje **3959-4006**: `_parseFromIframe()` forsøger at detektere animationer fra CSS rules, men GSAP/anime.js-animationer håndteres ikke — brugeren sendes bare en besked om at sætte dem manuelt. Keyframe-animationer importeres aldrig.

### Gradient editor kræver at `gradientDir` allerede er sat
Linje **2763-2784**: Gradient stops vises kun hvis `el.gradientDir` er defineret, men der er ingen UI til at sætte `gradientDir` på et nyt element — et kylling-og-æg problem.

### `loadRecentProject()` er stub
Linje **912**: Funktionen er tilsluttet UI men gør intet brugbart.

---

## 6. GENERELLE FORBEDRINGSMULIGHEDER

### Global state er 30+ løse variabler
Linje **620-651**: `elements`, `selIds`, `undoStack`, `dragging`, `showGrid` osv. er alle globale. Burde samles i ét `STATE`-objekt.

### `render()` og `updLayersList()` regenererer alt hver gang
Hverken kanvas-rendering eller lagpanelet er inkrementelt — hele DOM'en smides ud og bygges op fra bunden ved enhver ændring.

### Event delegation mangler
Store dele af UI bruger inline `onclick="..."` attributter i HTML i stedet for `.addEventListener()` på parent-elementer.

### Memory leak ved API polling
`setInterval` ID'erne gemmes ikke, så de kan aldrig ryddes op (se punkt 3).

---

## Prioriteret handlingsplan

| Prioritet | Problem | Linje |
|-----------|---------|-------|
| 🔴 | Tom catch på linje 3927 | 3927 |
| 🔴 | `loadRecentProject()` er ikke-funktionel stub | 912 |
| 🟠 | `setInterval` uden stop-mekanisme | 3506, 3931 |
| 🟠 | Duplikeret `apiFieldInsert` / `canvasApiFieldInsert` | 1228, 1236 |
| 🟠 | iframe cleanup ikke garanteret | 3945 |
| 🟡 | Slet ubrugt `setFontStyle()` | 2952 |
| 🟡 | Score Cycle felt-sletning mangler | 2069 |
| 🟢 | Saml binding-funktioner til én generisk | 1112, 2066, 2692 |
