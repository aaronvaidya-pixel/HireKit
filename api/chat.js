export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  try {
    const body = req.body || {};
    const { system, messages, max_tokens } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid request: messages array required.' });
    }

    // Truncate large payloads to prevent 413
    const MAX = 25000;
    const safeSystem = system && system.length > MAX ? system.substring(0, MAX) : (system || '');
    const safeMessages = messages.map(m => ({
      ...m,
      content: typeof m.content === 'string' && m.content.length > MAX
        ? m.content.substring(0, MAX) + '\n\n[Truncated]'
        : m.content
    }));

    const geminiKey    = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    // ── USE GEMINI ─────────────────────────────────────────
    if (geminiKey) {
      const userContent = safeMessages.map(m => m.content).join('\n\n');
      const fullPrompt  = safeSystem ? safeSystem + '\n\n' + userContent : userContent;

      const gResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: { maxOutputTokens: max_tokens || 2000, temperature: 0.7 }
          })
        }
      );

      const gData = await gResp.json();

      if (!gResp.ok) {
        console.error('Gemini error:', gData);
        return res.status(gResp.status).json({
          error: gData?.error?.message || 'Gemini API error. Please try again.'
        });
      }

      // Return in Anthropic-compatible format (frontend unchanged)
      const text = gData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.status(200).json({
        content: [{ type: 'text', text }],
        model: 'gemini-1.5-flash',
        usage: {}
      });
    }

    // ── USE ANTHROPIC (fallback) ───────────────────────────
    if (anthropicKey) {
      const aResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: max_tokens || 2000,
          system: safeSystem,
          messages: safeMessages,
        }),
      });

      const aData = await aResp.json();
      if (!aResp.ok) {
        console.error('Anthropic error:', aData);
        return res.status(aResp.status).json({
          error: aData?.error?.message || 'AI service error. Please try again.'
        });
      }
      return res.status(200).json(aData);
    }

    // ── NO KEY ────────────────────────────────────────────
    console.error('No API key set. Add GEMINI_API_KEY or ANTHROPIC_API_KEY in Vercel env vars.');
    return res.status(500).json({ error: 'Server configuration error. Contact admin.' });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Server error: ' + (err.message || 'Unknown') });
  }
}