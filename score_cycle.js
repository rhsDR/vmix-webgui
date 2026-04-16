/**
 * score_cycle.js — SPX Graphics Auto-Update Plugin
 * Læser window.ScoreCycle konfiguration og henter data fra API løbende.
 * Placer denne fil på SPX-serveren og angiv stien i SPX Editor → Plugin-fanen.
 */
(function () {
  'use strict';

  var cfg, fields, apiUrl;
  var currentData = null;
  var cycleIdx = 0;
  var cycleTimer = null;
  var isPlaying = false;
  var TRANS_MS = 320;

  /* ── Init ─────────────────────────────────────────────────────────── */
  function init() {
    cfg = window.ScoreCycle;
    if (!cfg || !cfg.projectId) return;

    fields = (cfg.dataFields || []).filter(function (f) {
      return f.field && f.target;
    });
    if (!fields.length) return;

    apiUrl = 'https://vmix-control.vercel.app/api/vmix/' + cfg.projectId;

    hookLifecycle();
    fetchData();
    setInterval(fetchData, Math.max(10, cfg.refreshInterval || 60) * 1000);
  }

  /* ── Hægt på SPX livscyklus ───────────────────────────────────────── */
  function hookLifecycle() {
    var origIN  = window.runAnimationIN;
    var origOUT = window.runAnimationOUT;

    window.runAnimationIN = function () {
      if (origIN) origIN();
      isPlaying = true;
      // Vent til IN-animationen er færdig, start så cycling
      var inDur = estimateInDuration();
      setTimeout(function () {
        if (isPlaying) startCycle();
      }, inDur + 200);
    };

    window.runAnimationOUT = function () {
      isPlaying = false;
      stopCycle();
      if (origOUT) origOUT();
    };
  }

  function estimateInDuration() {
    // Estimér IN-animationens varighed fra elementer i templates
    var max = 800;
    fields.forEach(function (f) {
      var el = document.getElementById(f.target);
      if (!el) return;
      var cs = window.getComputedStyle(el);
      var delays = (cs.transitionDelay || '0s').split(',');
      var durs   = (cs.transitionDuration || '0s').split(',');
      delays.forEach(function (d, i) {
        var total = (parseFloat(d) + parseFloat(durs[i] || 0)) * 1000;
        if (total > max) max = total;
      });
    });
    return max;
  }

  /* ── Datahentning ─────────────────────────────────────────────────── */
  function fetchData() {
    fetch(apiUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        currentData = Array.isArray(data) ? data[0] : data;
      })
      .catch(function (e) {
        console.warn('[ScoreCycle] Fetch fejlede:', e.message);
      });
  }

  /* ── Cycling ──────────────────────────────────────────────────────── */
  function startCycle() {
    stopCycle();
    cycleIdx = 0;
    showCurrent();
  }

  function stopCycle() {
    if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }
  }

  function showCurrent() {
    if (!isPlaying || !fields.length) return;

    // Find næste felt med en faktisk værdi (spring tomme felter over)
    var attempts = 0;
    while (attempts < fields.length) {
      var f   = fields[cycleIdx];
      var val = currentData && currentData[f.field] != null
                ? String(currentData[f.field]).trim()
                : '';
      if (val !== '') break;
      cycleIdx = (cycleIdx + 1) % fields.length;
      attempts++;
    }
    if (attempts >= fields.length) {
      // Ingen data endnu — prøv igen om lidt
      cycleTimer = setTimeout(showCurrent, 1000);
      return;
    }

    var field = fields[cycleIdx];
    var value = String(currentData[field.field]).trim();

    animateText(field.target, value, function () {
      if (!isPlaying) return;
      cycleTimer = setTimeout(function () {
        cycleIdx = (cycleIdx + 1) % fields.length;
        showCurrent();
      }, Math.max(1, cfg.displayDuration || 5) * 1000);
    });
  }

  /* ── Tekstanimation ───────────────────────────────────────────────── */
  function animateText(targetId, text, cb) {
    var el = document.getElementById(targetId);
    if (!el) { if (cb) cb(); return; }

    var t = cfg.transition || 'fade';

    if (t === 'cut') {
      el.textContent = text;
      if (cb) cb();
      return;
    }

    // OUT
    el.style.transition = 'opacity ' + TRANS_MS + 'ms ease, transform ' + TRANS_MS + 'ms ease';
    applyOut(el, t);

    setTimeout(function () {
      el.textContent = text;
      applyInStart(el, t);
      el.offsetHeight; // tving reflow så transition starter forfra
      el.style.transition = 'opacity ' + TRANS_MS + 'ms ease, transform ' + TRANS_MS + 'ms ease';
      el.style.opacity   = '1';
      el.style.transform = 'none';
      if (cb) setTimeout(cb, TRANS_MS);
    }, TRANS_MS);
  }

  function applyOut(el, t) {
    el.style.opacity = '0';
    if      (t === 'slide-up')    el.style.transform = 'translateY(-18px)';
    else if (t === 'slide-down')  el.style.transform = 'translateY(18px)';
    else if (t === 'slide-left')  el.style.transform = 'translateX(-28px)';
    else if (t === 'slide-right') el.style.transform = 'translateX(28px)';
    else                          el.style.transform = 'none';
  }

  function applyInStart(el, t) {
    el.style.opacity = '0';
    if      (t === 'slide-up')    el.style.transform = 'translateY(18px)';
    else if (t === 'slide-down')  el.style.transform = 'translateY(-18px)';
    else if (t === 'slide-left')  el.style.transform = 'translateX(28px)';
    else if (t === 'slide-right') el.style.transform = 'translateX(-28px)';
    else                          el.style.transform = 'none';
  }

  /* ── Start ────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
