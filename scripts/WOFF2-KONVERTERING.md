# Plan: Konvertér font-biblioteket til .woff2

**Status:** klar til at køre — udskudt til et roligt øjeblik (ikke midt i en udsendelse).
**Script:** [`scripts/fonts-to-woff2.py`](fonts-to-woff2.py) (committet).

## Hvorfor
`.woff2` er ~40–60% mindre end `.ttf`/`.otf` og virker i alle moderne browsere + vMix' browser-kilde (CEF).
Gevinst: mindre Vercel-deployment pr. push (rammer lager-bekymringen) + hurtigere font-load i overlays/editor.
Udseende er identisk (woff2 er en tabsfri re-indpakning af samme font).

| | Før | Efter |
|---|---|---|
| Font-bibliotek | ~53 MB (.ttf/.otf) | ~20–25 MB (.woff2) |
| Deployment pr. push | tungere | ~25–30 MB lettere |
| Font-load | langsommere | hurtigere |
| Udseende | — | identisk |

## Omfang
- **Konverteres:** `fonts/*.ttf` + `fonts/*.otf` (~110 filer). `fonts/google/` er allerede woff2 → røres ikke.
- **Referencer opdateres i 4 filer:** `spx-fonts.css`, `fonts.css`, `fullscreen.html`, `lower-third.html`.
- **Røres IKKE:** grafik-editoren (bruger font-navne + linker spx-fonts.css), font-upload-funktionen og
  master's FMT-mapping (håndterer allerede woff2).

## Fremgangsmåde

### Fase 0 — forstå
Alt sker lokalt og er reversibelt. Intet går live før `git push`. Originaler slettes ikke af scriptet.

### Fase 1 — forberedelse
```bash
cd /c/Users/rhs/vmix-webgui          # (eller C:\Users\rhs\vmix-webgui i PowerShell)
pip install --user fonttools brotli   # --user = ingen admin nødvendig (arbejds-PC)
git status                            # bør være clean, så font-ændringen bliver sin egen commit
```
`fonttools` læser/skriver fonte; `brotli` er selve woff2-komprimeringen. Begge hentes som færdige pakker.

### Fase 2 — kør
```bash
python scripts/fonts-to-woff2.py
```
Viser en linje pr. font (~1 min), så `Konverteret N, fejl 0`, så de 4 opdaterede filer.
Bagefter findes BÅDE .ttf/.otf OG .woff2 i `fonts/` (originaler stadig der).
> ⚠️ Er `fejl > 0`: stop. Den fonts @font-face peger nu på en .woff2 der ikke findes — fiks den ene først.

### Fase 3 — verificér FØR sletning
- Åbn `grafik-editor.html` i en browser (dobbeltklik / VS Code Live Server) → font-vælgerens previews skal se rigtige ud.
- `git diff spx-fonts.css | head` → `.ttf/.otf` → `.woff2`, `format('woff2')`.
- (Grundigst) push til en **branch** → test på Vercel preview-URL før main.

### Fase 4 — fjern originaler
```bash
git rm fonts/*.ttf fonts/*.otf        # besparelsen kommer HER; git-historik = backup
```

### Fase 5 — commit + push
```bash
git add -A
git commit -m "Konvertér font-bibliotek til woff2"
git push
```

### Fase 6 — vMix
Reload browser-kilderne (master/secondary/fullscreen + evt. lower-third) → de henter de nye fonte + CSS.

### Fase 7 — tjek live
Se et overlay/grafik på air; DR Publik osv. skal se identisk ud, bare loade hurtigere.

## Rollback
Alt er i git-historikken:
```bash
git checkout HEAD~1 -- fonts/ spx-fonts.css fonts.css fullscreen.html lower-third.html
```

## Mulig udvidelse
Tilføj et `--delete-originals`-flag til scriptet så det selv kører `git rm` efter vellykket konvertering
(springer Fase 4 over). Anbefales dog IKKE — behold det manuelle verifikations-trin imellem.
