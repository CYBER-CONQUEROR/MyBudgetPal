// assist/controllers/speechController.js
import fs from "fs";
import { toFile } from "openai/uploads";
import { getOpenAI } from "../services/openaiClient.js";

const guessExt = (mime = "") => {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("m4a")) return "m4a";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("flac")) return "flac";
  return "webm";
};

// ----------------------- TTS helpers -----------------------
/** Try to parse a JSON envelope like {display, speak} */
function parseSpeakEnvelope(maybeJson) {
  if (typeof maybeJson !== "string") return null;
  const t = maybeJson.trim();
  if (!t.startsWith("{")) return null;
  try {
    const obj = JSON.parse(t);
    if (obj && (typeof obj.speak === "string" || typeof obj.display === "string")) {
      return { speak: obj.speak ?? "", display: obj.display ?? "" };
    }
  } catch { /* ignore */ }
  return null;
}

/** Remove anything we don't want the TTS to read */
function stripForTTS(text) {
  if (!text) return "";

  let out = String(text);

  // 1) Remove explicit nospeak-tagged regions
  //    Usage in your prompts: <!--nospeak--> ... <!--/nospeak-->
  out = out.replace(/<!--\s*nospeak\s*-->[\s\S]*?<!--\s*\/nospeak\s*-->/gi, "");

  // 2) Remove the "🧩 Status:" block (up to the next blank line or end)
  //    Works for your checklist with bullets and emojis.
  out = out.replace(/🧩\s*Status:[\s\S]*?(?:\n{2,}|$)/i, "");

  // 3) (Optional) If you also recap with a card like "📋 **Confirm ...**", strip it too:
  out = out.replace(/📋\s*\*\*Confirm[\s\S]*?(?:\n{2,}|$)/i, "");

  // 4) Tidy extra blank lines
  out = out.replace(/\n{3,}/g, "\n\n").trim();

  return out;
}

// ----------------------- STT -----------------------
// POST /api/assist/speech/stt (multipart/form-data; field: "audio")
export async function stt(req, res) {
  if (!req.file) return res.status(400).json({ error: "audio_required" });
  if (!req.file.size) return res.status(400).json({ error: "empty_audio" });

  const openai = getOpenAI();
  const tmp = req.file.path;

  try {
    const ext = guessExt(req.file.mimetype);
    const filename =
      req.file.originalname?.match(/\.[a-z0-9]+$/i) ? req.file.originalname : `audio.${ext}`;

    const file = await toFile(fs.createReadStream(tmp), filename);
    const out = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
    });

    const text = out?.text || "";
    if (!text) return res.status(422).json({ error: "no_transcript" });
    return res.json({ text });
  } catch (e) {
    const status = e?.status || 500;
    return res.status(status).json({
      error: status === 401 ? "openai_auth_failed" : "stt_failed",
      detail: e?.message,
    });
  } finally {
    fs.unlink(tmp, () => {});
  }
}

// ----------------------- TTS -----------------------
// POST /api/assist/speech/tts (json: { text, voice?, format?, stripStatus? })
// stripStatus defaults to true; set stripStatus:false to speak everything.
export async function tts(req, res) {
  try {
    const {
      text,
      voice = "alloy",
      format = "mp3",
      stripStatus = true,          // <— default behavior: don't read status
    } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text_required" });
    }

    // If client accidentally sends a JSON envelope as text, prefer its `speak`.
    const env = parseSpeakEnvelope(text);
    let speakText = env?.speak != null ? env.speak : text;

    // Apply server-side filtering unless explicitly disabled
    if (stripStatus !== false) {
      speakText = stripForTTS(speakText);
    }

    if (!speakText.trim()) {
      return res.status(422).json({ error: "nothing_to_speak" });
    }

    const openai = getOpenAI();
    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: speakText,
      format, // mp3|wav|flac|opus (mp3 default)
    });

    const buf = Buffer.from(await speech.arrayBuffer());
    const mime =
      format === "wav" ? "audio/wav" :
      format === "flac" ? "audio/flac" :
      format === "opus" ? "audio/ogg" :
      "audio/mpeg";

    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", buf.length);
    return res.end(buf);
  } catch (e) {
    const status = e?.status || 500;
    return res.status(status).json({
      error: status === 401 ? "openai_auth_failed" : "tts_failed",
      detail: e?.message,
    });
  }
}
