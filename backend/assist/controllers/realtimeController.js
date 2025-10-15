// assist/controllers/realtimeController.js
/**
 * Issues an ephemeral client_secret for the OpenAI Realtime WebRTC API.
 * POST /api/assist/realtime/token
 * body: { model?: string, voice?: string, instructions?: string, vadSilenceMs?: number }
 */
export async function createRealtimeToken(req, res) {
  try {
    const model = req.body?.model || process.env.REALTIME_MODEL || "gpt-4o-realtime-preview";
    const voice = req.body?.voice || process.env.REALTIME_VOICE || "verse";
    const vadSilenceMs = Number.isFinite(+req.body?.vadSilenceMs)
      ? +req.body.vadSilenceMs
      : 600;

    const instructions =
      (req.body?.instructions ||
        "You are My Budget Pal. Be concise, friendly, and helpful about personal finance.") +
      " Only respond in English.";

    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
      },
      body: JSON.stringify({
        model,
        voice,
        modalities: ["audio", "text"],
        instructions,
        // Let the server handle speech turn-taking
        turn_detection: { type: "server_vad", silence_duration_ms: vadSilenceMs },
        // You can add input/output formats if you need specific codecs.
        // input_audio_format: "wav",
        // output_audio_format: "wav",
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(500).json({ error: "create_session_failed", detail });
    }

    const json = await r.json(); // { client_secret: { value }, model, id, ... }
    return res.json(json);
  } catch (e) {
    return res.status(500).json({
      error: "realtime_token_failed",
      detail: e?.message || String(e),
    });
  }
}
