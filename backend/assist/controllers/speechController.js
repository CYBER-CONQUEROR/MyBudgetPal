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
function isEnglishText(s = "") {
  // Consider it English if ≥90% of letters are A–Z
  const letters = (s.match(/\p{L}/gu) || []).length;
  if (!letters) return true; // numbers, emojis, etc.
  const en = (s.match(/[A-Za-z]/g) || []).length;
  return en / letters >= 0.9;
}

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
  let s = String(text).replace(/\r/g, "");

  // 1) Remove explicit nospeak regions  <!--nospeak--> ... <!--/nospeak-->
  s = s.replace(/<!--\s*nospeak\s*-->[\s\S]*?<!--\s*\/nospeak\s*-->/gi, "");

  // 2) Remove “or send corrections like:” heading + following bullet lines of backticked key:value
  //    (handles multiple lines; stops when a non backticked-bullet line appears)
  s = s.replace(
    /^\s*or\s+send\s+corrections\s+like\s*:\s*(?:\n\s*(?:[•\-–*]\s*)?(?:`[^`]+`(?:\s{1,2}|$)){1,}\s*)+/gim,
    ""
  );
  // Also remove any stray bullet lines composed mostly of backticked snippets
  s = s.replace(/^\s*(?:[•\-–*]\s*)?(?:`[^`]+`(?:\s{1,2}|$)){2,}\s*$/gim, "");
  // And any line with 3+ backticked snippets (fallback)
  s = s.replace(/^.*(?:`[^`]+`.*){3,}.*$/gim, "");

  // 3) Strip the 🧩 Status section ONLY, then continue reading from after it.
  //    We parse line-by-line: remove header + subsequent checklist lines (bullets/checkboxes),
  //    stop as soon as we hit a non-status line (e.g., 💸 prompt).
  const lines = s.split("\n");
  const out = [];
  const isStatusHeader = (ln) => /^\s*🧩\s*Status\s*:?\s*$/i.test(ln);

  // Lines considered part of the status block:
  // - bullets or numbered items
  // - markdown checkboxes: "- [x] ..." / "* [ ] ..."
  // - emoji checkboxes/toggles at line start: ✅, ☑, ☒, ⬜, ☐, ◻️
  // - plain bullet lines (•, -, *, –, —)
  const isStatusItem = (ln) => {
    if (!ln.trim()) return true; // allow a blank line inside the block
    if (/^\s*[✅☑☒⬜☐◻️]/.test(ln)) return true;
    if (/^\s*(?:[•\-–—*]|\d+\.)\s*(?:\[[ xX]\]\s*)?/.test(ln)) return true; // bullets / - [x] /
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    if (isStatusHeader(lines[i])) {
      // skip header
      i++;
      // skip following status items (contiguous)
      while (i < lines.length && isStatusItem(lines[i])) i++;
      // step back one because for-loop will i++ next
      i--;
      continue; // do not push any of the skipped lines
    }
    out.push(lines[i]);
  }

  s = out.join("\n");

  // 4) Tidy extra blank lines
  s = s.replace(/\n{3,}/g, "\n\n").trim();

  return s;
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

    // Force English, ask for verbose_json so we *could* read detected language too.
    const out = await openai.audio.transcriptions.create({
      model: process.env.STT_MODEL || "whisper-1",
      file,
      language: "en",
      response_format: "verbose_json",
      temperature: 0,
    });

    const text = (out?.text || "").trim();
    if (!text) return res.status(422).json({ error: "no_transcript" });

    // Extra guard: reject if transcript is mostly non-English letters
    if (!isEnglishText(text)) {
      return res.status(422).json({
        error: "non_english_audio",
        message: "Please speak in English.",
        language: out?.language || "unknown",
      });
    }

    return res.json({ text, language: out?.language || "en" });
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
