// assist/services/chatStream.js
/**
 * Robust SSE streamer for OpenAI Responses API.
 * - Uses /v1/responses with stream:true
 * - Parses "event:" + "data:" frames and forwards only output_text deltas
 * - Ends cleanly on "response.completed"
 */

export async function streamChat({ messages, model = "gpt-4.1-mini", system }, res) {
  // 1) Prepare SSE to the client
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // 2) Build request payload for OpenAI Responses API
  const inputBlocks = [];
  if (system) {
    inputBlocks.push({ role: "system", content: system });
  }
  for (const m of messages) {
    inputBlocks.push({ role: m.role, content: m.content });
  }

  // 3) Call OpenAI
  let r;
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY");
    }
    r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: inputBlocks,
        stream: true,
      }),
    });
  } catch (err) {
    console.error("[streamChat] fetch error ->", err?.message || err);
    res.write(`data: OpenAI request failed.\n\n`);
    return res.end();
  }

  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => "");
    console.error("[streamChat] OpenAI bad status:", r.status, text);
    res.write(`data: OpenAI returned ${r.status}. ${text.slice(0, 300)}\n\n`);
    return res.end();
  }

  // 4) Parse OpenAI SSE frames
  const reader = r.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let currentEvent = "";
  let ended = false;

  const flushLines = () => {
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? ""; // keep incomplete line

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith("data:")) continue;

      const jsonText = line.slice(5).trim();
      if (!jsonText) continue;

      try {
        const payload = JSON.parse(jsonText);

        // forward text deltas
        if (currentEvent === "response.output_text.delta") {
          const piece = payload?.delta || "";
          if (piece) {
            res.write(`data: ${piece}\n\n`);
          }
        }

        // end of response
        if (currentEvent === "response.completed") {
          ended = true;
        }
      } catch (e) {
        // sometimes non-JSON keepalive frames appear; ignore
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      flushLines();
      if (ended) break;
    }
  } catch (e) {
    console.warn("[streamChat] SSE read interrupted:", e?.message || e);
  } finally {
    // send final blank event to close on client
    res.write("data: \n\n");
    res.end();
  }
}
