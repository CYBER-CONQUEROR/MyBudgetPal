// assist/controllers/chatController.js
import { streamChat } from "../services/chatStream.js";
import { detectIntent } from "../services/nlu.js";

// ===== Intents =====
import { handleAddAccountIntent } from "../intents/addAccountIntent.js";
import { handleAddTransactionIntent } from "../intents/addTransactionIntent.js";

// ===== Sessions =====
import {
  getAddAccountSession,
  getAddTransactionSession,
} from "../services/sessionStore.js";

function sse(res, text) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${text}\n\n`);
}
function sseEnd(res) { res.write("data: \n\n"); res.end(); }

// Pull a plain string from various body shapes
function readUtterance(req) {
  const body = req.body || {};
  // 1) messages array (OpenAI-style)
  if (Array.isArray(body.messages) && body.messages.length) {
    const last = body.messages[body.messages.length - 1];
    if (typeof last?.content === "string") return last.content.trim();
    if (Array.isArray(last?.content)) {
      const t = last.content.find((p) => p?.type === "text" && p?.text)?.text;
      if (t) return String(t).trim();
    }
  }
  // 2) simple { message: "..." } or { text: "..." } or raw body string
  const raw = body.message ?? body.text ?? (typeof body === "string" ? body : "");
  return String(raw || "").trim();
}

// Small registry so we can add more intents without if/else ladders
const INTENTS = {
  add_account: {
    getSession: getAddAccountSession,
    handler: handleAddAccountIntent,
  },
  add_transaction: {
    getSession: getAddTransactionSession,
    handler: handleAddTransactionIntent,
  },
};

export async function chat(req, res) {
  try {
    const rawUserId = req.userId || req.headers["x-user-id"] || req.cookies?.userId || null;
    const userId = rawUserId ? String(rawUserId) : null;  // normalize to string
    const utterance = readUtterance(req);
    const model = req.body?.model || "gpt-4.1-mini";

    console.log("[assist/chat] hit", { userId, model });
    console.log("[assist/chat] utterance:", utterance);

    if (!utterance) {
      sse(res, "🤔 I didn’t receive any text. Try: `add a bank account` or `log an expense`");
      return sseEnd(res);
    }

    // 1) STICKY: if any intent session exists for this user, route to it
    for (const [name, api] of Object.entries(INTENTS)) {
      const sess = userId ? api.getSession(userId) : null;
      console.log(`[router] ${name} session active?`, !!sess);
      if (sess) {
        await api.handler(utterance, userId, res);
        return;
      }
    }

    // 2) Otherwise detect intent for this turn
    const intent = await detectIntent(utterance);
    console.log("[router] intent:", intent);

    if (intent && INTENTS[intent]) {
      await INTENTS[intent].handler(utterance, userId, res);
      return;
    }

    // 3) Fallback general chat (LLM answers; no DB claims)
    const system =
      "You are My Budget Pal Assistant. Be concise, friendly, and helpful about personal finance. " +
      "If users ask to add/update/delete accounts/transactions, do NOT claim it was done. " +
      "Instead, guide them or trigger the appropriate intent.";
    const messages = Array.isArray(req.body?.messages)
      ? req.body.messages
      : [{ role: "user", content: utterance }];

    await streamChat({ messages, model, system }, res);
  } catch (e) {
    console.error("[assist/chat] fatal:", e);
    if (!res.headersSent) res.status(500).json({ error: "server_error" });
  }
}
