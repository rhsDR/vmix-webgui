// ── CONFIG — defineret i js/auth.js ───────────────────────────

// ── STATE ─────────────────────────────────────────────────────
let aktivProjektId = new URLSearchParams(window.location.search).get('p') || '';
let projektType = 'kampdag'; // sættes ved load baseret på URL-parameter
let activeSubSlot = 0; // slot nummer for aktiv sub (0 = ingen)
let dropdowns = { holds: [], kommentatorer: [], lokationer: [] };

const makeKamp = () => ({
  hold1Lang: '', hold1Kort: '', hold1Score: 0,
  hold2Score: 0, hold2Kort: '', hold2Lang: '',
  kommentator: '', lokation: '', vmixcall: '', onAir: false,
  fixtureId: null,
  enetpulseId: null, starttime: '',
  // edit buffer
  editMode: false, collapsed: false,
  buf: { hold1Lang: '', hold2Lang: '', kommentator: '', lokation: '', vmixcall: '', lokSomKomm: false }
});

let kampe = Array.from({ length: 6 }, makeKamp);

// ── TICKER STATE ──────────────────────────────────────────────
const makeTicker = () => ({
  overskrift: '', tekst: '', onAir: false, breaking: false,
  editMode: false, collapsed: false,
  buf: { overskrift: '', tekst: '' }
});
let tickers = Array.from({ length: 20 }, makeTicker);

// ── SUBS STATE ────────────────────────────────────────────────
const makeSub      = () => ({ navn: '', titel: '', editMode: false, buf: { navn: '', titel: '' } });
const makeVmixCall = () => ({ navn: '', titel: '', link: '', editMode: false, collapsed: false, buf: { navn: '', titel: '', link: '' } });
let subs      = Array.from({ length: 15 }, makeSub);
let vmixCalls = Array.from({ length: 8  }, makeVmixCall);


// ── CREDITS STATE ─────────────────────────────────────────────
let creditsData = { items: [], speed: 30 };
let creditNewCounter = 0;
let creditsTriggerActive = false;
const OVERLAY_GRAPHICS = [
  { id: 'lower-third', label: 'SUB',              file: 'lower-third.html',    triggerKey: 'lt_trigger',         type: 'lt',      color: '#4a9eff' },
  { id: 'ticker',      label: 'Ticker',           file: 'Graphics/Ticker/Ticker_gsap.html', triggerKey: 'ticker_ovl_trigger', type: 'ticker',  color: '#aa66ff' },
  { id: 'breaking',    label: 'Breaking Ticker',  file: null,                  triggerKey: 'breaking_trigger',   type: 'simple',  color: '#ff4444', subOf: 'ticker' },
  { id: 'score',       label: 'Stillings',        file: null,                  triggerKey: 'score_trigger',      type: 'simple',  color: '#44cc88', subOf: 'ticker' },
  { id: 'live-boks',  label: 'Live Boks',        file: 'Graphics/LIve_bokse/Live_BOKS_gsap.html', triggerKey: 'live_boks_trigger', type: 'simple', color: '#ff2244', subOf: 'ticker' },
  { id: 'overlay-3',   label: 'Opstilling',       file: 'fullscreen.html',      triggerKey: 'lineup_trigger',     type: 'lineup',  color: '#ff8833' },
  { id: 'credits',     label: 'Credits',          file: 'credits.html',        triggerKey: 'credits_trigger',    type: 'credits', color: '#ffcc44' },
  { id: 'komm',        label: 'Komm Boks',        file: null,                  triggerKey: null,                 type: 'komm',    color: '#4a9eff' },
];
const KOMM_BOKSE = [
  { slot: 1, id: 'komm-k1', triggerKey: 'Komm_score_K-1', file: 'Graphics/Komm_score_boks/Komm_BOKS_K-1.html' },
  { slot: 2, id: 'komm-k2', triggerKey: 'Komm_score_K-2', file: 'Graphics/Komm_score_boks/Komm_BOKS_K-2.html' },
  { slot: 3, id: 'komm-k3', triggerKey: 'Komm_score_K-3', file: 'Graphics/Komm_score_boks/Komm_BOKS_K-3.html' },
  { slot: 4, id: 'komm-k4', triggerKey: 'Komm_score_K-4', file: 'Graphics/Komm_score_boks/Komm_BOKS_K-4.html' },
  { slot: 5, id: 'komm-k5', triggerKey: 'Komm_score_K-5', file: 'Graphics/Komm_score_boks/Komm_BOKS_K-5.html' },
  { slot: 6, id: 'komm-k6', triggerKey: 'Komm_score_K-6', file: 'Graphics/Komm_score_boks/Komm_BOKS_K-6.html' },
];
const DEFAULT_LAG_ORDER = OVERLAY_GRAPHICS.filter(g => g.file !== null && !g.subOf).map(g => g.id);
const DEFAULT_TICKER_SUB_ORDER = ['live-boks', 'breaking', 'ticker-breaking', 'score-breaking', 'ticker', 'score'];
let overlayLagOrder   = [...DEFAULT_LAG_ORDER];
let tickerLagOrder    = [...DEFAULT_TICKER_SUB_ORDER];
let tickerSubExpanded = false;
let grafiktState        = {}; // { triggerKey: currentValue }
let _kommPaaMode        = false; // sættes true ved PÅ-klik, false ved AF-klik
let _rgDebounceTimer    = null;
let _rgoDebounceTimer   = null;
function _debouncedRenderGrafik()    { clearTimeout(_rgDebounceTimer);  _rgDebounceTimer  = setTimeout(renderGrafik,    80); }
function _debouncedRenderGrafikOps() { clearTimeout(_rgoDebounceTimer); _rgoDebounceTimer = setTimeout(renderGrafikOps, 80); }
let customGrafik        = []; // rækker fra projekt_grafik-tabellen
let grafikOverlayMap    = {}; // { grafik-id: 'hoved'|'komm' } for built-in grafikker
let makroer             = []; // rækker fra projekt_makroer-tabellen
let grafiktActiveSubTab = 'lower-third';
let grafiktActivePrvKey = '';
let grafiktActivePrvUrl = '';
let grafiktCompanionOpen = false;
let egneGrafikOpen = false;
let makroerPanelOpen = false;


// ── LIVE DASHBOARD ────────────────────────────────────────────
let liveTimer    = null;
let lastCardSeen       = {}; // fixtureId → sidste sete korttype+minut+spiller
let lineupOnAirMatchId = null; // matchId der aktuelt er on air, eller null
let lineupSlots = {}; // { "1": { home: payload, away: payload }, ... } — pre-loadet per kamp-slot
const liveExpandedLineup = new Set(); // matchId → opstilling synlig
const livePitchMode      = new Map(); // matchId → 'liste' | 'bane'
const liveExpandedStats  = new Set(); // matchId → statistik synlig
const liveExpandedTable  = new Set(); // matchId → ligatable synlig
const liveExpandedH2H    = new Set(); // matchId → H2H synlig
const liveStatsCache     = new Map(); // matchId → renderet statistik HTML
const liveTableCache     = new Map(); // matchId → renderet ligatable HTML
const liveTopScorerCache = new Map(); // matchId → renderet topscorer HTML
const liveH2HCache       = new Map(); // matchId → renderet H2H HTML
const liveTableTab       = new Map(); // matchId → 'table' | 'topscorer'
const liveMatchData      = new Map(); // matchId → fuldt match-objekt fra enetpulse
