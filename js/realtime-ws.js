// ── Fælles Supabase Realtime-forbindelse for overlay-siderne ─────────────
// Ejer transportlaget: forbind, kanal-join, heartbeat, reconnect og
// forbindelsesstatus. Sidens egen beskedhåndtering gives som onMessage.
// Kræver js/supabase-config.js indlæst først.
//
//   createRealtimeWS({
//     topic:           'triggers-<projektId>'  (uden "realtime:"-præfiks)
//     postgresChanges: [ { event, schema, table, filter }, ... ]
//     onMessage:       function(msg) { ... }   (kaldes med parsed JSON)
//     onOpen:          function() { ... }      (valgfri — kaldes også ved reconnect)
//   })
//
// Status: window.__wsConnected (true/false) + console.warn ved tab.
// Synlig rød prik kan slås til med &wsdot=1 i URL'en — KUN til test:
// siderne ligger on air i vMix, så prikken må aldrig være standard.
function createRealtimeWS(opts) {
  var _ws = null, _ref = 0, _hb = null;
  var _showDot = /[?&]wsdot=1/.test(location.search);

  function _dot(show) {
    if (!_showDot || !document.body) return;
    var el = document.getElementById('ws-status-dot');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ws-status-dot';
      el.style.cssText = 'position:fixed;top:8px;right:8px;width:14px;height:14px;' +
        'border-radius:50%;background:#e11;box-shadow:0 0 8px #e11;' +
        'z-index:2147483647;pointer-events:none;display:none;';
      document.body.appendChild(el);
    }
    el.style.display = show ? 'block' : 'none';
  }

  function _setConnected(on) {
    window.__wsConnected = on;
    if (!on) console.warn('[realtime] forbindelse tabt (' + opts.topic + ') — genforbinder om 3 s');
    _dot(!on);
  }

  function _connect() {
    try {
      _ws = new WebSocket(SB_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SB_ANON + '&vsn=1.0.0');
      _ws.onopen = function() {
        _setConnected(true);
        _ws.send(JSON.stringify({ topic: 'realtime:' + opts.topic, event: 'phx_join',
          payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' },
            postgres_changes: opts.postgresChanges || [] }, access_token: SB_ANON }, ref: String(++_ref) }));
        _hb = setInterval(function() {
          if (_ws && _ws.readyState === 1)
            _ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++_ref) }));
        }, 25000);
        if (opts.onOpen) { try { opts.onOpen(); } catch (e) { console.warn('[realtime] onOpen-fejl:', e); } }
      };
      _ws.onmessage = function(e) {
        var msg = null;
        // En korrupt besked må aldrig vælte lytteren — spring den over
        try { msg = JSON.parse(e.data); } catch (err) { return; }
        if (!msg) return;
        try { opts.onMessage(msg); } catch (err) { console.warn('[realtime] besked-fejl:', err); }
      };
      _ws.onclose = function() { clearInterval(_hb); _hb = null; _setConnected(false); setTimeout(_connect, 3000); };
      _ws.onerror = function() { try { _ws.close(); } catch (e) {} };
    } catch (e) { _setConnected(false); setTimeout(_connect, 3000); }
  }

  _connect();
  return { getWs: function() { return _ws; } };
}
