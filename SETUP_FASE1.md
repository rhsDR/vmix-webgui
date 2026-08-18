# Fase 1: Opsætning efter sikkerheds-rettelserne

Rettelserne virker først, når to nye "hemmelige indstillinger" (miljøvariabler)
er oprettet i Vercel, og der er deployet igen. Følg trinene i rækkefølge.

## Trin 1: Opret de to miljøvariabler i Vercel

1. Gå til [vercel.com](https://vercel.com) → log ind → vælg projektet **vmix-webgui**
2. Klik **Settings** → **Environment Variables**
3. Opret disse to variabler (sæt flueben i alle tre miljøer: Production, Preview, Development):

| Navn | Værdi |
|------|-------|
| `DEFAULT_INVITE_PASSWORD` | En **NY** startkode til inviterede brugere. VIGTIGT: Brug IKKE den gamle kode — den ligger i GitHub-historikken for altid og skal betragtes som kendt. |
| `TRIGGER_TOKEN` | En lang, tilfældig tekst (mindst 30 tegn). Lav den fx ved at åbne PowerShell og køre `[guid]::NewGuid()` to gange og sætte resultaterne sammen — eller brug en adgangskode-generator. |

## Trin 2: Push koden

Push som du plejer. Vercel deployer automatisk, og de nye variabler er med.

## Trin 3: Opdater dine Companion-knapper

Alle de gamle trigger-adresser er nu **lukkede** — de svarer med "Ugyldig eller
manglende token". De nye adresser indeholder tokenet automatisk:

1. Åbn kontrolpanelet → **GRAFIK**-fanen
2. Kopiér de viste Companion-URLs igen (de indeholder nu `token=...`)
3. Sæt dem ind i dine Companion-knapper i stedet for de gamle

## Trin 4: Test

- **Companion:** Tryk på en opdateret knap → grafik reagerer. Prøv en gammel
  URL (uden token) i browseren → skal give fejl 401.
- **Invitation:** Invitér en testbruger i admin → log ind med den NYE startkode.
- **Datakilder:** Åbn kampe-fanen og søg en kamp / åbn LIVE-fanen → data hentes
  som før (du er logget ind, så det virker automatisk).

## Hvad blev ændret (teknisk oversigt)

- `api/invite.js` + `api/set-password.js`: startkoden læses fra
  `DEFAULT_INVITE_PASSWORD` — står ikke længere i koden.
- `api/trigger/[id].js`: kræver nu `?token=` der matcher `TRIGGER_TOKEN`.
- `api/trigger-token.js` (ny): udleverer tokenet til loggede brugere, så
  panelet kan vise færdige Companion-URLs.
- `api/enetpulse.js`, `api/fixture-search.js`, `api/player.js`,
  `api/standings.js`: kræver nu login (gyldig session fra panelet).
- `app.js`: sender automatisk login-token med til datakilderne og indsætter
  trigger-tokenet i de viste Companion-URLs.
- `api/team-image.js` er bevidst stadig åben: den bruges som billede-adresse
  i overlay-siderne (billeder kan ikke sende login), og svarene caches af
  Vercels CDN, så kvote-risikoen er minimal.
- `api/vmix/[id].js` er bevidst stadig åben: det er datakilden, som vMix selv
  og eksporterede grafikker læser fra (kun læsning).
