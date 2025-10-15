// assist/services/chatStream.js
/**
 * Robust SSE bridge for OpenAI Responses API.
 * - Calls /v1/responses with stream:true
 * - Parses upstream SSE (event:/data:)
 * - Forwards ONLY text deltas (preserving spaces and real newlines)
 * - Closes cleanly on response.completed / response.error
 */

export async function streamChat({ messages, model = "gpt-4.1-mini", system }, res) {
  // 1) Prepare SSE to the browser
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // 2) Build input blocks
  const input = [];
  if (system) input.push({ role: "system", content: system });
  for (const m of Array.isArray(messages) ? messages : []) {
    input.push({ role: m.role, content: m.content });
  }

  // 3) Upstream request
  if (!process.env.OPENAI_API_KEY) {
    res.write("data: Missing OPENAI_API_KEY\n\n");
    return res.end();
  }

  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input, stream: true }),
    });
  } catch (err) {
    res.write("data: OpenAI request failed\n\n");
    return res.end();
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    res.write(`data: Upstream error: ${String(detail || upstream.status)}\n\n`);
    return res.end();
  }

  // 4) Parse upstream SSE properly
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  let buf = "";
  let curEvent = "";
  let dataLines = [];
  let finished = false;

  function emitBrowser(data) {
    // Preserve *real* newlines by emitting multiple data lines (SSE spec).
    // Don't strip spaces — streaming models often send a leading " " delta.
    const text = String(data).replace(/\r/g, ""); // drop CR only
    const lines = text.split("\n");
    for (const l of lines) {
      res.write(`data: ${l}\n`);
    }
    // end-of-event boundary
    res.write("\n");
  }

  function flushFrame() {
    if (dataLines.length === 0 && !curEvent) return;
    const data = dataLines.join("\n"); // original payload for this event
    dataLines = [];

    try {
      if (curEvent === "response.output_text.delta") {
        // Some SDKs send a raw JSON string, others { delta: "..." }.
        let piece = "";
        try {
          const parsed = JSON.parse(data);
          piece =
            typeof parsed === "string"
              ? parsed
              : (parsed && (parsed.delta ?? parsed.text ?? "")) || "";
        } catch {
          // Not JSON — treat as raw text delta (preserve spaces)
          piece = data;
        }
        // Emit even if piece is a single space — it's significant in streaming.
        if (piece !== undefined && piece !== null) emitBrowser(piece);
      } else if (
        curEvent === "response.completed" ||
        curEvent === "response.error" ||
        curEvent === "error"
      ) {
        finished = true;
      }
    } finally {
      curEvent = "";
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // process line by line, honoring blank-line frame boundaries
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);

      if (line.startsWith("event:")) {
        curEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        // DO NOT trimStart() — leading spaces are meaningful deltas.
        dataLines.push(line.slice(5));
      } else if (line.trim() === "") {
        // end of one SSE event frame
        flushFrame();
        if (finished) break;
      }
    }
    if (finished) break;
  }

  // 5) Close client stream
  res.write("data: \n\n");
  res.end();
}
