// Kør fra projektmappen: node generate-player-index.js
// Henter filliste fra Supabase Storage og genererer players/index.json lokalt.
// Upload derefter index.json til roden af players-bucketen via Supabase-dashboardet.

const fs   = require('fs');
const path = require('path');

const SB_URL  = 'https://rxzxdcweqpbnvfkpnnrn.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4enhkY3dlcXBibnZma3BubnJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzYzMTUsImV4cCI6MjA5MDgxMjMxNX0.e6DtMVskOwcMyJBFJDIEYsSZC0HAcD7AhNcg5PvlArU';
const BUCKET  = 'spiller-profiler';
const OUT     = path.join(__dirname, 'index.json');

const HEADERS = {
  'apikey':        SB_ANON,
  'Authorization': 'Bearer ' + SB_ANON,
  'Content-Type':  'application/json'
};

async function listFolder(prefix) {
  const res = await fetch(`${SB_URL}/storage/v1/object/list/${BUCKET}`, {
    method:  'POST',
    headers: HEADERS,
    body:    JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } })
  });
  if (!res.ok) throw new Error(`Storage list fejlede (${res.status}): ${await res.text()}`);
  return await res.json();
}

async function main() {
  console.log('Henter filliste fra Supabase Storage...');

  // Liste top-niveau (hold-mapper)
  const topLevel = await listFolder('');
  const folders  = topLevel.filter(e => e.id === null).map(e => e.name);
  const index    = {};
  let   count    = 0;

  for (const folder of folders) {
    const files = await listFolder(folder + '/');
    for (const f of files) {
      if (!f.name) continue;
      const ext = path.extname(f.name).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) continue;

      const match = f.name.match(/-(\d+)\.[^.]+$/);
      if (!match) {
        console.warn(`  Spring over (intet ID i filnavn): ${folder}/${f.name}`);
        continue;
      }

      const id      = match[1];
      const relPath = `${folder}/${f.name}`;
      if (index[id]) {
        console.warn(`  Duplikat ID ${id}: "${index[id]}" og "${relPath}" — beholder første`);
        continue;
      }
      index[id] = relPath;
      count++;
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(index, null, 2), 'utf8');
  console.log(`Fandt ${count} spillere.`);
  console.log(`Gemt lokalt: ${OUT}`);
  console.log('');
  console.log('Upload nu index.json til roden af players-bucketen i Supabase-dashboardet.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
