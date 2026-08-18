// ── Fælles Supabase-konfiguration for overlay-siderne ────────────────────
// Bruges af de faste overlays (overlay, overlay-komm, lower-third, OverLay_3,
// ticker-overlay, credits m.fl.). Skal indlæses FØR sidens egen kode:
//   <script src="js/supabase-config.js"></script>
//
// OBS: Custom grafik i blob-iframes kan IKKE bruge denne fil (relative stier
// virker ikke i blob-URL'er) — de beholder deres egen indlejrede kopi.
//
// Anon-nøglen er offentlig pr. design — sikkerheden ligger i Supabase RLS.
var SB_URL  = 'https://rxzxdcweqpbnvfkpnnrn.supabase.co';
var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4enhkY3dlcXBibnZma3BubnJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzYzMTUsImV4cCI6MjA5MDgxMjMxNX0.e6DtMVskOwcMyJBFJDIEYsSZC0HAcD7AhNcg5PvlArU';
var SB_HDR  = { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' };
var SB_HEADERS = SB_HDR; // alias — bruges af credits.html
