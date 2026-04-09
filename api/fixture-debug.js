export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const API_KEY = process.env.API_FOOTBALL_KEY;
  if (!API_KEY) return res.status(503).json({ error: 'API-nøgle ikke konfigureret' });

  const endpoint = req.query.ep || 'fixtures?league=119&last=5';
  const data = await fetch(
    `https://v3.football.api-sports.io/${endpoint}`,
    { headers: { 'x-apisports-key': API_KEY } }
  ).then(r => r.json());

  return res.status(200).json(data);
}
