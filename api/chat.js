export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(500).json({ error: 'Server configuration error. Contact admin.' });
  }

  try {
    const body = req.body || {};
    const { system, messages, max_tokens } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid request: messages array required.' });
    }

    const MAX = 25000;
    const safeSystem = system && system.length > MAX ? system.substring(0, MAX) : (system || '');
    const userContent = messages
      .map(m => typeof m.content === 'string' && m.content.length > MAX
        ? m.content.substring(0, MAX) + '\n[Truncated]'
        : m.content)
      .join('\n\n');

    const fullPrompt = safeSystem ? safeSystem + '\n\n' + userContent : userContent;

    // Try models in order until one works
    const models = [
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash',
      'gemini-1.0-pro',
    ];

    let lastError = null;
    for (const model of models) {
      const gResp = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${geminiKey}`,
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

      if (gResp.ok) {
        const text = gData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          return res.status(200).json({
            content: [{ type: 'text', text }],
            model,
            usage: {}
          });
        }
      }

      // Rate limited — try next model
      if (gResp.status === 429) {
        lastError = gData?.error?.message || 'Rate limit exceeded';
        continue;
      }

      // Other error
      console.error(`Gemini ${model} error:`, JSON.stringify(gData));
      lastError = gData?.error?.message || 'AI error';
    }

    // All models failed
    return res.status(429).json({
      error: 'AI service is temporarily at capacity. Please wait a moment and try again.'
    });

  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: 'Server error: ' + (err.message || 'Unknown') });
  }
}