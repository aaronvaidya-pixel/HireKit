export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured. Contact admin.' });
  }

  try {
    const { system, messages, max_tokens } = req.body || {};
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid request: messages array required.' });
    }

    const MAX = 25000;
    const safeSystem = system && system.length > MAX ? system.substring(0, MAX) : (system || '');
    const safeMessages = messages.map(function(m) {
      return {
        role: m.role || 'user',
        content: typeof m.content === 'string' && m.content.length > MAX
          ? m.content.substring(0, MAX) + '\n[Truncated]'
          : (m.content || '')
      };
    });

    const groqMessages = [];
    if (safeSystem) groqMessages.push({ role: 'system', content: safeSystem });
    for (var i = 0; i < safeMessages.length; i++) {
      groqMessages.push(safeMessages[i]);
    }

    const gResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + groqKey
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: groqMessages,
        max_tokens: max_tokens || 2000,
        temperature: 0.7
      })
    });

    const gData = await gResp.json();
    if (!gResp.ok) {
      return res.status(gResp.status).json({
        error: gData && gData.error && gData.error.message
          ? gData.error.message
          : 'AI service error. Please try again.'
      });
    }

    const text = gData && gData.choices && gData.choices[0] && gData.choices[0].message
      ? gData.choices[0].message.content : '';
    if (!text) return res.status(500).json({ error: 'Empty response from AI. Please try again.' });

    return res.status(200).json({
      content: [{ type: 'text', text: text }],
      model: 'llama3-70b-8192'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + (err.message || 'Unknown error') });
  }
}
