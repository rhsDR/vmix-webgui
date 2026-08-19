// ── CLOCK ─────────────────────────────────────────────────────
function tickClock() {
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('clock').textContent =
    `${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}
setInterval(tickClock, 1000);
tickClock();

// ── MUSIK ─────────────────────────────────────────────────────
const sange = ['sang1.mp3', 'sang2.mp3', 'sang3.mp3', 'sang4.mp3'];
const audio = new Audio();
let spillerNu = false;

function tilfældigSang() {
  return sange[Math.floor(Math.random() * sange.length)];
}

document.getElementById('playBtn').addEventListener('click', () => {
  if (spillerNu) {
    audio.pause();
    audio.currentTime = 0;
    spillerNu = false;
    document.getElementById('playBtn').textContent = '▶';
  } else {
    audio.src = tilfældigSang();
    audio.play();
    spillerNu = true;
    document.getElementById('playBtn').textContent = '⏹';
  }
});

audio.addEventListener('ended', () => {
  spillerNu = false;
  document.getElementById('playBtn').textContent = '▶';
});


// ── TOAST ─────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── CLIPBOARD ─────────────────────────────────────────────────
async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopieret!', 'ok');
  } catch {
    toast('Kopiering fejlede', 'err');
  }
}

// ── FLASH SAVED ───────────────────────────────────────────────
function flashSaved(el, color = 'blue') {
  if (!el) return;
  const cls = 'flash-saved-' + color;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

// ── TITLE CASE ────────────────────────────────────────────────
function toTitleCase(str) {
  return str.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
}
function titleCaseInput(el, buf, key) {
  el.addEventListener('blur', () => {
    const val = toTitleCase(el.value);
    el.value  = val;
    buf[key]  = val;
  });
}


// ── HTML ESCAPE ───────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

