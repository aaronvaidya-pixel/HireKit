export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var NOTION_KEY = process.env.NOTION_API_KEY;
  var DB_ID = 'b36e5d81c9c442b08c2b4005fb3dc377';

  if (!NOTION_KEY) {
    console.error('NOTION_API_KEY not set in environment');
    return res.status(500).json({ error: 'Tracking not configured' });
  }

  try {
    var body = req.body || {};
    var eventName = body.event || 'login';
    var validEvents = ['signup', 'login', 'payment_notify', 'feedback', 'jd_request'];
    if (validEvents.indexOf(eventName) < 0) eventName = 'login';

    var planName = body.plan || 'free';
    var validPlans = ['free', 'pro', 'admin'];
    if (validPlans.indexOf(planName) < 0) planName = 'free';

    var deviceName = body.device || 'desktop';
    if (deviceName !== 'mobile' && deviceName !== 'desktop') deviceName = 'desktop';

    var props = {
      "Name": { "title": [{ "text": { "content": (body.name || 'Anonymous').substring(0, 200) } }] },
      "Event": { "select": { "name": eventName } },
      "Plan": { "select": { "name": planName } },
      "Device": { "select": { "name": deviceName } }
    };

    if (body.email && body.email.indexOf('@') > 0) {
      props["Email"] = { "email": body.email };
    }

    console.log('Tracking:', eventName, body.name, body.email);

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

    var respData = await resp.json();

    if (!resp.ok) {
      console.error('Notion error:', resp.status, JSON.stringify(respData));
      return res.status(200).json({ ok: false, note: 'logged locally' });
    }

    console.log('Tracked OK:', eventName, body.email);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Track error:', err.message);
    return res.status(200).json({ ok: false, note: 'error caught' });
  }
}
