export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error('GEMINI_API_KEY not set in environment variables');
    return res.status(500).json({ error: 'Server configuration error. Contact admin.' });
  }

  try {
    const body = req.body || {};
    const { system, messages, max_tokens } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid request: messages array required.' });
    }

    // Truncate to prevent large payloads
    const MAX = 25000;
    const safeSystem = system && system.length > MAX
      ? system.substring(0, MAX)
      : (system || '');
    const userContent = messages
      .map(m => typeof m.content === 'string' && m.content.length > MAX
        ? m.content.substring(0, MAX) + '\n[Truncated]'
        : m.content)
      .join('\n\n');

    const fullPrompt = safeSystem
      ? safeSystem + '\n\n' + userContent
      : userContent;

    const gResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            maxOutputTokens: max_tokens || 2000,
            temperature: 0.7
          }
        })
      }
    );

    const gData = await gResp.json();

    if (!gResp.ok) {
      console.error('Gemini API error:', JSON.stringify(gData));
      return res.status(gResp.status).json({
        error: gData?.error?.message || 'AI service error. Please try again.'
      });
    }

    const text = gData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      console.error('Empty response from Gemini:', JSON.stringify(gData));
      return res.status(500).json({ error: 'Empty response from AI. Please try again.' });
    }

    // Return in Anthropic-compatible format so frontend needs no changes
    return res.status(200).json({
      content: [{ type: 'text', text }],
      model: 'gemini-1.5-flash',
      usage: {}
    });

  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: 'Server error: ' + (err.message || 'Unknown error') });
  }
}