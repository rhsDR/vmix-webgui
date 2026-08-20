# Vejledning: Fase 4 — Lås databasen med RLS

En trin-for-trin-guide til at slå Row Level Security (RLS) til på vmix-webgui's
database. Skrevet så du kan følge den uden at kunne SQL eller Supabase på forhånd.

> **Kort version:** Du kopierer nogle færdige SQL-opskrifter ind i Supabase og
> trykker Run, én ad gangen, og tester panelet imellem. Hvis noget går galt,
> kører du "fortryd"-opskriften — og alt er som før. Dine data røres aldrig.

---

## 1. Hvad laver vi, og hvorfor?

Databasenøglen (`anon`-nøglen) ligger åbent i koden, fordi dine overlays i vMix
skal kunne hente data uden login. Problemet: lige nu kan **enhver der finder den
nøgle** også *skrive* direkte i databasen — ændre kampe, slette ting, på tværs af
alle projekter. Sikkerheden ligger kun i at siderne opfører sig pænt.

**RLS (Row Level Security)** er databasens eget låsesystem. Efter det er slået til:
- **Alle må stadig LÆSE** (overlays virker uændret).
- **Kun indloggede må SKRIVE** (panelet, via dit login).
- Server-funktionerne (triggers, datacache) skriver med en hemmelig server-nøgle
  der har lov til alt.

Resultat: en fremmed med `anon`-nøglen kan ikke længere ødelægge dine data.

---

## 2. Hvorfor det er sikkert (dine 3 sikkerhedsnet)

1. **Supabase's daglige backups** (du er på Pro) — kan gendanne hele databasen til
   i går aftes med ét klik i dashboardet.
2. **Din lokale JSON-kopi** — `C:\Users\rhs\vmix-backup-2026-08-20\` (alle rækker
   fra alle tabeller, taget før vi begyndte).
3. **Fortryd-filer** — hver SQL-opskrift har en tilhørende `_rollback.sql`, der
   fjerner ændringen igen med det samme.

Og vigtigst: **RLS ændrer kun regler, aldrig dine data.** Ingen rækker slettes
eller redigeres. Vi tænder og slukker kun en lås.

---

## 3. Sådan kører du en SQL-fil i Supabase (grundmønsteret)

Det er den samme fremgangsmåde hver gang:

1. Log ind på **https://supabase.com** → vælg projektet **vmix-webgui**.
2. I venstremenuen: klik på **SQL Editor** (ikonet der ligner `>_`).
3. Klik **+ New query** (øverst).
4. Åbn den SQL-fil jeg har lagt i `supabase/`-mappen, **markér alt** (Ctrl+A),
   **kopiér** (Ctrl+C), og **indsæt** (Ctrl+V) i den tomme forespørgsel.
5. Tryk **Run** (knappen nederst til højre, eller Ctrl+Enter).
6. Kig på resultatet nederst:
   - **"Success. No rows returned"** = det gik godt. ✅
   - En **rød fejl** = noget er galt — stop, og send mig fejlteksten.

> Du kan altid køre den samme opskrift igen — den er lavet så det ikke gør skade
> at gentage.

---

## 4. Rækkefølgen — overblik

Vi tager det i bidder og tester imellem, så vi aldrig låser alt på én gang:

| Trin | Hvad | Risiko |
|------|------|--------|
| **1. Canary** | Låser ÉN tabel (`dropdowns`) som prøve | Meget lav |
| **2. App-tabeller** | Låser kampe, tickers, subs, credits m.fl. | Lav |
| **3. settings** | Låser settings + smal undtagelse til 2 overlay-triggers | Mellem |
| **4. user_roles** | Låser admin-rolletabellen (særlig streng) | Mellem |

Efter hvert trin tester du panelet. Går noget galt: kør trinnets fortryd-fil.

Jeg skriver SQL'en for trin 2–4 **efter** canary'en er bevist at virke — så vi
ved at grundmodellen er rigtig, før vi ruller den bredt ud.

---

## 5. TRIN 1: Canary (dropdowns) — detaljeret

**Filer:**
- Kør: [`2026-08-20_rls_fase4_canary.sql`](2026-08-20_rls_fase4_canary.sql)
- Fortryd: [`2026-08-20_rls_fase4_canary_rollback.sql`](2026-08-20_rls_fase4_canary_rollback.sql)

**Hvad den gør:** Slår RLS til på `dropdowns` og laver to regler — "alle må læse"
og "kun indloggede må skrive". `dropdowns` er valgt fordi den er lille og
ufarlig (holdnavne, kommentatornavne, lokationer til rullelisterne).

**Sådan:**
1. Følg grundmønsteret i afsnit 3 med canary-filen.
2. Forvent **"Success. No rows returned"**.

---

## 6. Sådan tester du i panelet (efter trin 1)

Åbn panelet (vmix-control.vercel.app) og log ind. Lav disse to tjek:

**Test A — LÆSNING (skal virke):**
- Gå ind og rediger en kamp. Rullelisterne med hold/kommentator skal stadig
  vises som normalt.
- ✅ Virker → `anon`-læsning er OK.

**Test B — SKRIVNING (skal virke):**
- Gå til **STAMDATA**-fanen.
- Tilføj en test-kommentator (eller ret en eksisterende) og gem.
- ✅ Gemmer uden fejl → din indloggede JWT-skrivning er OK.
- ❌ Fejl / "row-level security policy" → skrivningen bruger ikke dit login.
  Kør fortryd-filen (afsnit 7) og skriv til mig.

**Begge virker?** Så er grundmodellen bevist. Sig til, så laver jeg trin 2.

> Tip: Slet gerne test-kommentatoren igen bagefter — det er også en skrivning,
> så det tester samtidig at "slet" virker.

---

## 7. Hvis noget går galt — sådan låser du op igen

Ingen panik. Der er to niveauer:

**A) Fortryd det sidste trin (hurtigst):**
- Kør trinnets `_rollback.sql`-fil (samme fremgangsmåde som afsnit 3).
- Den fjerner reglerne og slår RLS fra igen på den tabel. Panelet virker straks
  som før. **Dine data er urørt.**

**B) Gendan hele databasen (kun hvis alt er galt — usandsynligt):**
- Supabase-dashboardet → **Database → Backups** → vælg backuppen fra i går →
  **Restore**. (Bemærk: det ruller ALT tilbage til det tidspunkt, også evt.
  data-ændringer siden. Derfor bruger vi altid fortryd-filen først.)

Du behøver aldrig røre din lokale JSON-kopi — den er kun det yderste net.

---

## 8. Hvad ruller vi ud i trin 2–4? (så du ved hvad der kommer)

- **Trin 2 — app-tabeller:** Samme to regler som canary'en (alle læser, kun
  indloggede skriver) på: `kampe`, `tickers`, `subs`, `vmix_calls`, `credits`,
  `projekter`, `projekt_grafik`, `projekt_makroer`.
- **Trin 3 — settings:** Samme, men med **én smal undtagelse**: `overlay-3` og
  `credits`-siderne nulstiller selv deres egen trigger (`lineup_trigger` /
  `credits_trigger`) efter visning. De to nøgler får lov til at blive skrevet af
  `anon` — alt andet i settings kræver login. (Komm-boksene skrev også før, men
  det fjernede vi i komm-boks-fixet, så listen er kort.)
- **Trin 4 — user_roles:** Den følsomme tabel (hvem er admin). Her må `anon`
  **ikke engang læse**. Indloggede må kun læse deres egen rolle, og kun en admin
  må ændre roller (håndhævet af en lille databasefunktion). Denne kører vi helt
  til sidst og tester grundigt.

Hvert trin får sin egen SQL-fil + fortryd-fil i `supabase/`-mappen.

---

## 9. Ordliste

- **RLS (Row Level Security):** Databasens indbyggede lås, der bestemmer hvem der
  må læse/skrive hvilke rækker.
- **Policy:** En enkelt regel under RLS (fx "alle må læse dropdowns").
- **`anon`:** Den offentlige nøgle, som overlays og ikke-indloggede bruger. Efter
  RLS: må som udgangspunkt kun læse.
- **`authenticated`:** Dig, når du er logget ind i panelet. Sender en personlig
  nøgle (JWT). Efter RLS: må skrive.
- **`service_role`:** En hemmelig server-nøgle (kun i Vercel, aldrig i browseren).
  Bypasser RLS helt — bruges af triggers og datacache.
- **JWT:** Den midlertidige personlige nøgle du får ved login, som beviser hvem
  du er over for databasen.

---

## 10. Tjekliste

- [ ] Trin 1: kørt canary-SQL (Success)
- [ ] Test A: dropdowns vises ved kamp-redigering (læsning OK)
- [ ] Test B: gemt en kommentator i STAMDATA (skrivning OK)
- [ ] Meldt tilbage → få trin 2
- [ ] Trin 2: app-tabeller (SQL + test)
- [ ] Trin 3: settings (SQL + test — tjek også at en overlay-trigger stadig virker)
- [ ] Trin 4: user_roles (SQL + test — tjek at admin-siden stadig virker)
- [ ] Slut: skift mellem to projekter og bekræft at intet lækker på tværs

---

*Spørg endelig undervejs — det er bedre at spørge én gang for meget end at gætte.*
