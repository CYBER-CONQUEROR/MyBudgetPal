// src/components/ChatWidget.jsx
import React, { useEffect, useRef, useState } from "react";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import CloseIcon from "@mui/icons-material/Close";
import MicIcon from "@mui/icons-material/Mic";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import SendIcon from "@mui/icons-material/Send";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import SettingsVoiceIcon from "@mui/icons-material/SettingsVoice";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import CircularProgress from "@mui/material/CircularProgress";
import api from "../api/api.js";

function apiBase() {
  const base = api.defaults.baseURL || "";
  return base.replace(/\/$/, "");
}
function userIdHeader() {
  try {
    const raw = localStorage.getItem("mbp_user");
    const u = raw ? JSON.parse(raw) : null;
    return u?._id ? { "x-user-id": u._id } : {};
  } catch {
    return {};
  }
}

export default function ChatWidget() {
  const [open, setOpen] = useState(true);
  const [msgs, setMsgs] = useState([
    { role: "assistant", content: "Hi! I’m your Budget Pal. Tap Convo to talk hands-free 🎙️" },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [convoOn, setConvoOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const listRef = useRef(null);
  const mediaRecRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioRef = useRef(null);
  const abortRef = useRef(null);
  const convoAbortRef = useRef({ stop: false });

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const vadRAFRef = useRef(0);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs, open]);

  useEffect(() => {
    if (!convoOn) {
      stopEverything();
    } else {
      startConversationLoop();
    }
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convoOn]);

  const canSend = input.trim().length > 0 && !streaming && !thinking && !speaking;

  /** ---------- SSE reader (robust) ---------- */
  async function readSSEStream(body, onEvent) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let eventBuf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      // Consume complete lines
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);

        // SSE framing:
        // "data: ..." lines belong to the payload
        // blank line => end of one event
        if (line.startsWith("data: ")) {
          eventBuf += line.slice(6) + "\n";
        } else if (line.trim() === "") {
          if (eventBuf.length) {
            // Complete one event payload (preserve all newlines)
            onEvent(eventBuf.replace(/\n$/, ""));
            eventBuf = "";
          }
        } else {
          // Our server sometimes embeds raw newlines inside the single 'data:' write.
          // Treat unprefixed lines as part of the payload.
          eventBuf += line + "\n";
        }
      }
    }
    // Flush any trailing payload
    if (eventBuf.length) onEvent(eventBuf.replace(/\n$/, ""));
  }

  /** ---------- STREAM CHAT (SSE) ---------- */
  const startStream = async (history) => {
    setStreaming(true);
    const url = `${apiBase()}/assist/chat`;
    const controller = new AbortController();
    abortRef.current = controller;

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...userIdHeader() },
        credentials: "include",
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
    } catch (e) {
      console.error("fetch /assist/chat failed:", e);
      setMsgs((m) => [...m, { role: "assistant", content: "Chat API unreachable." }]);
      setStreaming(false);
      abortRef.current = null;
      return "";
    }

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      console.error("chat HTTP error", res.status, t);
      setMsgs((m) => [...m, { role: "assistant", content: "Chat API is unavailable right now." }]);
      setStreaming(false);
      abortRef.current = null;
      return "";
    }

    // Start a new assistant bubble (we'll update the content as events arrive)
    setMsgs((m) => [...m, { role: "assistant", content: "" }]);
    let acc = "";

    try {
      await readSSEStream(res.body, (payload) => {
        // Accumulate multiple events with a blank line between them
        acc = acc ? acc + "\n\n" + payload : payload;
        setMsgs((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: sanitizeStream(acc),
          };
          return copy;
        });
      });
    } catch (e) {
      console.warn("SSE interrupted:", e?.message || e);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }

    return acc;
  };

  const send = async () => {
    if (!canSend) return;
    bargeIn();
    const userMsg = { role: "user", content: input.trim() };
    setMsgs((m) => [...m, userMsg]);
    setInput("");
    await startStream([...msgs, userMsg]);
  };

  const stopStream = () => {
    try { abortRef.current?.abort(); } catch {}
    abortRef.current = null;
    setStreaming(false);
  };

  /** ---------- STT ---------- */
  const transcribeBlob = async (blob) => {
    const form = new FormData();
    form.append("audio", blob, "clip.webm");
    const res = await fetch(`${apiBase()}/assist/speech/stt`, {
      method: "POST",
      credentials: "include",
      headers: { ...userIdHeader() },
      body: form,
    });
    if (!res.ok) throw new Error("STT failed");
    const data = await res.json();
    return data?.text || "";
  };

  /** ---------- TTS ---------- */
  const speak = async (text) => {
    try {
      setSpeaking(true);
      const res = await fetch(`${apiBase()}/assist/speech/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...userIdHeader() },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const el = audioRef.current;
      el.src = url;
      await el.play();
      await new Promise((resolve) => {
        const onEnd = () => { el.removeEventListener("ended", onEnd); resolve(); };
        el.addEventListener("ended", onEnd);
      });
    } finally {
      setSpeaking(false);
    }
  };

  /** ---------- BASIC VAD RECORD ---------- */
  const recordUntilSilence = async ({
    minMs = 600,
    silenceMs = 900,
    levelThreshold = 0.015,
  } = {}) => {
    if (!mediaStreamRef.current) {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    }
    const stream = mediaStreamRef.current;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    const source = ctx.createMediaStreamSource(stream);
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 2048;
    }
    const analyser = analyserRef.current;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const startedAt = performance.now();
    let lastLoud = performance.now();

    setRecording(true);
    rec.start(50);

    await new Promise((resolve) => {
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        if (rms > levelThreshold) lastLoud = now;

        const longEnough = now - startedAt >= minMs;
        const silentLong = now - lastLoud >= silenceMs;

        if (longEnough && silentLong) {
          rec.stop();
          cancelAnimationFrame(vadRAFRef.current);
          vadRAFRef.current = 0;
          resolve();
          return;
        }
        vadRAFRef.current = requestAnimationFrame(tick);
      };
      vadRAFRef.current = requestAnimationFrame(tick);
    });

    await new Promise((r) => { rec.onstop = () => r(); });
    setRecording(false);
    source.disconnect();
    const blob = new Blob(chunks, { type: "audio/webm" });
    return blob;
  };

  /** ---------- CONVERSATION LOOP ---------- */
  const startConversationLoop = async () => {
    convoAbortRef.current.stop = false;
    while (!convoAbortRef.current.stop) {
      try {
        const blob = await recordUntilSilence();
        if (convoAbortRef.current.stop) break;

        setThinking(true);
        let userText = "";
        try {
          userText = await transcribeBlob(blob);
        } finally {
          setThinking(false);
        }
        if (!userText) continue;

        setMsgs((m) => [...m, { role: "user", content: userText }]);
        const reply = await startStream([...msgs, { role: "user", content: userText }]);
        if (!reply) continue;

        if (convoAbortRef.current.stop) break;
        await speak(reply);
      } catch {
        // keep looping
      }
    }
  };

  const stopConversationLoop = () => {
    convoAbortRef.current.stop = true;
    stopEverything();
  };

  const bargeIn = () => {
    try { audioRef.current?.pause(); audioRef.current.currentTime = 0; } catch {}
    if (recording) setRecording(false);
    stopStream();
  };

  const stopEverything = () => {
    try { audioRef.current?.pause(); } catch {}
    setSpeaking(false);
    stopStream();
    if (vadRAFRef.current) cancelAnimationFrame(vadRAFRef.current);
    vadRAFRef.current = 0;
    try { mediaRecRef.current?.stop(); } catch {}
    setRecording(false);
  };

  const toggleRecord = async () => {
    if (recording) { stopEverything(); return; }
    bargeIn();
    try {
      const blob = await recordUntilSilence();
      setThinking(true);
      const text = await transcribeBlob(blob);
      setThinking(false);
      if (!text) {
        setMsgs((m) => [...m, { role: "assistant", content: "I didn’t catch that — try again?" }]);
        return;
      }
      setMsgs((m) => [...m, { role: "user", content: text }]);
      await startStream([...msgs, { role: "user", content: text }]);
    } catch {
      setThinking(false);
      setMsgs((m) => [...m, { role: "assistant", content: "Voice processing failed." }]);
    }
  };

  const speakLast = async () => {
    const last = [...msgs].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    bargeIn();
    await speak(last.content);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700"
          title="Chat with us"
        >
          <ChatBubbleOutlineIcon />
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-indigo-600/10 grid place-items-center">
                <ChatBubbleOutlineIcon fontSize="small" className="text-indigo-700" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">My Budget Pal Assistant</div>
                <div className="text-xs text-slate-500">
                  {speaking ? "Speaking…" : streaming ? "Responding…" : thinking ? "Processing…" : recording ? "Listening…" : (convoOn ? "Convo mode: ON" : "Online")}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {!convoOn ? (
                <button
                  onClick={() => setConvoOn(true)}
                  className="rounded-lg p-2 text-indigo-700 hover:bg-indigo-50"
                  title="Start conversation mode"
                >
                  <SettingsVoiceIcon fontSize="small" />
                </button>
              ) : (
                <button
                  onClick={stopConversationLoop}
                  className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                  title="Stop conversation mode"
                >
                  <PauseCircleIcon fontSize="small" />
                </button>
              )}

              <button
                onClick={speakLast}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                title="Read last answer"
              >
                <VolumeUpIcon fontSize="small" />
              </button>

              <button
                onClick={() => { setOpen(false); stopEverything(); setConvoOn(false); }}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                title="Close"
              >
                <CloseIcon fontSize="small" />
              </button>
            </div>
          </div>

          {/* messages */}
          <div ref={listRef} className="max-h-[60vh] overflow-y-auto px-3 py-3 space-y-3 bg-slate-50/40">
            {msgs.map((m, i) => (<Bubble key={i} role={m.role} text={m.content} />))}
            {(streaming || thinking || recording || speaking) && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200 text-sm text-slate-700 flex items-center gap-2">
                  <CircularProgress size={16} />
                  {speaking ? "Speaking…" : streaming ? "Typing…" : thinking ? "Thinking…" : "Listening…"}
                </div>
              </div>
            )}
          </div>

          {/* composer */}
          <div className="border-t border-slate-200 p-2">
            <div className="flex items-end gap-2">
              <button
                onClick={toggleRecord}
                className={`rounded-xl px-3 py-2 text-sm font-medium ${recording ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`}
                title={recording ? "Stop" : "Hold to talk"}
              >
                {recording ? <StopCircleIcon fontSize="small" /> : <MicIcon fontSize="small" />}
              </button>

              <textarea
                rows={1}
                value={input}
                onChange={(e) => { bargeIn(); setInput(e.target.value); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  if (e.key === "Escape") { bargeIn(); }
                }}
                placeholder="Type a message…"
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {!streaming ? (
                <button
                  onClick={send}
                  disabled={!canSend}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${canSend ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-200 text-slate-500"}`}
                  title="Send"
                >
                  <SendIcon fontSize="small" />
                </button>
              ) : (
                <button
                  onClick={stopStream}
                  className="rounded-xl px-3 py-2 text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600"
                  title="Stop streaming"
                >
                  Stop
                </button>
              )}
            </div>

            <audio ref={audioRef} className="hidden" />
          </div>
        </div>
      )}
    </>
  );
}

/** --------- Bubble renderer with code-fence support --------- */
function Bubble({ role, text }) {
  const mine = role === "user";
  const isFence = typeof text === "string" && text.startsWith("```") && text.endsWith("```");
  const content = isFence ? text.slice(3, -3).trim() : text;

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      {isFence ? (
        <pre
          className={[
            "max-w-[85%] whitespace-pre-wrap break-words text-sm leading-relaxed",
            "px-3 py-2 rounded-2xl shadow-sm ring-1",
            mine
              ? "bg-indigo-600 text-white ring-indigo-600/20 rounded-br-sm"
              : "bg-white text-slate-800 ring-slate-200 rounded-tl-sm",
          ].join(" ")}
        >
          {content}
        </pre>
      ) : (
        <div
          className={[
            "max-w-[85%] whitespace-pre-wrap break-words text-sm leading-relaxed",
            "px-3 py-2 rounded-2xl shadow-sm ring-1",
            mine
              ? "bg-indigo-600 text-white ring-indigo-600/20 rounded-br-sm"
              : "bg-white text-slate-800 ring-slate-200 rounded-tl-sm",
          ].join(" ")}
        >
          {content}
        </div>
      )}
    </div>
  );
}

/** Keep newlines; collapse only 3+ into 2; normalize CRLF */
function sanitizeStream(s) {
  try {
    return String(s ?? "")
      .replace(/\r/g, "")
      .replace(/\n{4,}/g, "\n\n"); // keep intentional blank lines
  } catch {
    return s || "";
  }
}
