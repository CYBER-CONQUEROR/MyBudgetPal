// assist/controllers/realtimeController.js
/**
 * Issues an ephemeral client_secret for OpenAI Realtime API (WebRTC).
 * POST /api/assist/realtime/token
 * body: { model?: string, voice?: string, instructions?: string }
 */
export async function createRealtimeToken(req, res) {
  try {
    const model = req.body?.model || "gpt-4o-realtime-preview-2024-12-17";
    const voice = req.body?.voice || "alloy";
    const instructions =
      req.body?.instructions ||
      "You are My Budget Pal. Be concise, friendly, and helpful about personal finance.";

    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice,
        instructions,
        // turn_detection: "server_vad", // optional
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(500).json({ error: "create_session_failed", detail });
    }
    const json = await r.json(); // { client_secret: { value, expires_at }, id, ... }
    return res.json(json);
  } catch (e) {
    return res.status(500).json({ error: "realtime_token_failed", detail: e?.message });
  }
}
