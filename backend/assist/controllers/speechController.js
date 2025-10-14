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

    // Allow override via env for faster STT model if available.
    // Fallback remains whisper-1 (stable).
    const sttModel = process.env.OPENAI_STT_MODEL || "whisper-1";

    const out = await openai.audio.transcriptions.create({
      model: sttModel,
      file,
      // Helps decoding + speeds up for English speech (adjust if needed)
      language: "en",
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

// POST /api/assist/speech/tts (json: { text, voice? })
export async function tts(req, res) {
  try {
    const { text, voice = "alloy", format = "mp3" } = req.body || {};
    if (!text || typeof text !== "string")
      return res.status(400).json({ error: "text_required" });

    const openai = getOpenAI();
    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
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
