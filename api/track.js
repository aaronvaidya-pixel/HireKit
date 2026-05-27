export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var NOTION_KEY = process.env.NOTION_API_KEY;
  var DB_ID = 'b36e5d81c9c442b08c2b4005fb3dc377';

  if (!NOTION_KEY) {
    return res.status(500).json({ error: 'NOTION_API_KEY not set' });
  }

  try {
    var body = req.body || {};
    var props = {
      "Name": { "title": [{ "text": { "content": body.name || "Anonymous" } }] },
      "Event": { "select": { "name": body.event || "login" } },
      "Email": { "email": body.email || null },
      "Plan": { "select": { "name": body.plan || "free" } },
      "Device": { "select": { "name": body.device || "desktop" } }
    };

    var resp = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + NOTION_KEY,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { database_id: DB_ID },
        properties: props
      })
    });

    if (!resp.ok) {
      var errData = await resp.json();
      return res.status(resp.status).json({ error: errData.message || 'Notion error' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
