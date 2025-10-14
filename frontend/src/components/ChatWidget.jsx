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
import api from "../api/api";
import ConvoButton from "../components/ConvoButton.jsx";

// base URL pulled from your axios instance
function apiBase() {
  const base = api.defaults.baseURL || "";
  // strip trailing /api if present
  return base.replace(/\/api\/?$/, "");
}

export default function ChatWidget() {
  const [open, setOpen] = useState(true);
  const [msgs, setMsgs] = useState([
    { role: "assistant", content: "Hey! How can I help you with your budget today? 😊" },
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

  // WebAudio nodes for basic VAD
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const vadRAFRef = useRef(0);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs, streaming, thinking, speaking]);

  // ---------- SSE CHAT ----------
  const startStream = async (messages) => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
      abortRef.current = null;
    }
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const res = await fetch(`${apiBase()}/api/assist/chat`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      credentials: "include",
    });

    if (!res.ok || !res.body) {
      setMsgs((m) => [...m, { role: "assistant", content: "Chat API is unavailable right now." }]);
      setStreaming(false);
      abortRef.current = null;
      return "";
    }

    setMsgs((m) => [...m, { role: "assistant", content: "" }]);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // SSE "data: ..." lines
        const lines = chunk
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => (l.startsWith("data: ") ? l.slice(6) : l));

        for (const line of lines) {
          acc += line + "\n";
          setMsgs((all) => {
            const copy = [...all];
            copy[copy.length - 1] = { role: "assistant", content: sanitizeStream(acc) };
            return copy;
          });
        }
      }
    } catch {
      /* aborted ok */
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }

    return acc;
  };

  const send = async () => {
    const canSend = input.trim().length > 0 && !streaming;
    if (!canSend) return;
    bargeIn(); // if speaking, stop and send text
    const userMsg = { role: "user", content: input.trim() };
    setMsgs((m) => [...m, userMsg]);
    setInput("");
    await startStream([...msgs, userMsg]);
  };

  const stopStream = () => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { }
      abortRef.current = null;
    }
    setStreaming(false);
  };

  // ---------- STT (single shot) ----------
  const transcribeBlob = async (blob) => {
    const form = new FormData();
    form.append("audio", blob, "clip.webm");
    const { data } = await api.post("/assist/stt", form);
    return data?.text || "";
  };

  // ---------- TTS ----------
  const speak = async (text) => {
    try {
      setSpeaking(true);
      const { data } = await api.post(
        "/assist/tts",
        { text },
        { responseType: "arraybuffer" }
      );
      const audio = new Audio();
      audioRef.current = audio;
      audio.src = URL.createObjectURL(new Blob([data], { type: "audio/mpeg" }));
      await audio.play();
      // wait to end
      await new Promise((r) => {
        audio.onended = () => r();
        audio.onerror = () => r();
      });
    } catch {
      /* ignore */
    } finally {
      setSpeaking(false);
    }
  };

  // ---------- BASIC VAD RECORD (stops on silence) ----------
  const recordUntilSilence = async ({
    minMs = 450,          // minimum capture duration (was 600)
    silenceMs = 650,      // stop after this much silence (was 900)
    levelThreshold = 0.014 // 0..1 simple energy threshold (was 0.015)
  } = {}) => {
    // request/get cached stream
    if (!mediaStreamRef.current) {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    }
    const stream = mediaStreamRef.current;

    // reset per-capture speech start flag for auto-barge
    window.__speechStarted = false;

    // VAD via WebAudio
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
        // RMS-ish level
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128; // -1..1
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length); // 0..1
        const now = performance.now();
        // [VOICE] auto-barge when speech starts
        if (!window.__speechStarted && rms > levelThreshold) {
          window.__speechStarted = true;
          try { bargeIn(); } catch {}
        }

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

    // wait for stop to flush chunks
    await new Promise((r) => {
      rec.onstop = () => r();
    });

    setRecording(false);
    source.disconnect();
    const blob = new Blob(chunks, { type: "audio/webm" });
    return blob;
  };

  // ---------- CONVERSATION LOOP ----------
  const startConversationLoop = async () => {
    // reset abort flag
    convoAbortRef.current.stop = false;

    while (!convoAbortRef.current.stop) {
      try {
        // 1) Listen (ends on silence)
        const blob = await recordUntilSilence();
        if (convoAbortRef.current.stop) break;

        // 2) Transcribe
        setThinking(true);
        let userText = "";
        try {
          userText = await transcribeBlob(blob);
        } finally {
          setThinking(false);
        }
        if (!userText) {
          // nothing captured: loop again
          continue;
        }
        setMsgs((m) => [...m, { role: "user", content: userText }]);

        // 3) Get reply (stream)
        const full = await startStream([...msgs, { role: "user", content: userText }]);
        if (!full) continue;

        // 4) Speak final reply if convo mode still on, and not interrupted
        if (!convoAbortRef.current.stop) {
          await speak(full);
        }
      } catch {
        // ignore & keep loop unless stopped
      }
    }
  };

  const stopConversationLoop = () => {
    convoAbortRef.current.stop = true;
    stopEverything();
  };

  const bargeIn = () => {
    // stop TTS and recording/streaming if user interacts
    try { audioRef.current?.pause(); audioRef.current.currentTime = 0; } catch { }
    setSpeaking(false);
    if (recording) setRecording(false);
    stopStream();
  };

  const stopEverything = () => {
    // stop TTS
    try { audioRef.current?.pause(); } catch { }
    setSpeaking(false);

    // stop stream
    stopStream();

    // stop VAD loop
    if (vadRAFRef.current) cancelAnimationFrame(vadRAFRef.current);
    vadRAFRef.current = 0;

    // stop recorder
    try { mediaRecRef.current?.stop(); } catch { }
    setRecording(false);

    // keep mic stream for faster restarts (optional). If you want to fully close:
    // mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    // mediaStreamRef.current = null;
  };

  // ---------- STT (manual button) ----------
  const toggleRecord = async () => {
    if (recording) {
      // VAD controls stopping; user pressing again = barge-in stop
      stopEverything();
      return;
    }
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
      const full = await startStream([...msgs, { role: "user", content: text }]);
      if (full) await speak(full);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[380px] max-w-[92vw]">
      <div className="rounded-2xl shadow-xl ring-1 ring-slate-200 bg-white overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-indigo-600/10 grid place-items-center">
              <ChatBubbleOutlineIcon fontSize="small" className="text-indigo-700" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">My Budget Pal Assistant</div>
              <div className="text-xs text-slate-500">
                {speaking ? "Speaking…" : streaming ? "Responding…" : recording ? "Listening…" : (convoOn ? "Convo mode: ON" : "Online")}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Convo toggle */}
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

            {/* volume test button */}
            <button
              onClick={async () => {
                bargeIn();
                await speak("Hi! I will speak briefly. Press the spacebar or mic button to interrupt me anytime.");
              }}
              className="rounded-lg p-2 text-slate-700 hover:bg-slate-100"
              title="Test TTS"
            >
              <VolumeUpIcon fontSize="small" />
            </button>

            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              title="Close"
            >
              <CloseIcon fontSize="small" />
            </button>
          </div>
        </div>

        {/* messages */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-3 space-y-3">
          {msgs.map((m, i) => (
            <Bubble key={i} who={m.role}>{m.content}</Bubble>
          ))}

          {(streaming || thinking || recording || speaking) && (
            <div className="flex items-center gap-2 pl-10">
              <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-1.5 ring-1 ring-slate-200 text-sm text-slate-700 flex items-center gap-2">
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
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
                // [VOICE] Space = stop speaking (barge-in)
                if (e.key === " " && speaking) {
                  e.preventDefault();
                  bargeIn();
                }
                if (e.key === "Escape") {
                  bargeIn();
                }
              }}
              placeholder="Type a message…"
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />

            {!streaming ? (
              <button
                onClick={send}
                disabled={!input.trim()}
                className={`rounded-xl px-3 py-2 text-sm font-medium ${input.trim() ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-200 text-slate-500"}`}
                title="Send"
              >
                <SendIcon fontSize="small" />
              </button>
            ) : (
              <button
                onClick={bargeIn}
                className="rounded-xl px-3 py-2 text-sm font-medium bg-rose-100 text-rose-700 hover:bg-rose-200"
                title="Stop response"
              >
                <StopCircleIcon fontSize="small" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ who, children }) {
  const me = who === "user";
  const text = String(children || "");
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div
        className={`${me ? "rounded-2xl rounded-tr-sm bg-indigo-600 text-white" : "rounded-2xl rounded-tl-sm bg-white text-slate-800 ring-1 ring-slate-200"} px-3 py-2 max-w-[82%] text-sm whitespace-pre-wrap leading-relaxed`}
      >
        {text}
      </div>
    </div>
  );
}

function sanitizeStream(s) {
  try {
    return s.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n");
  } catch {
    return s || "";
  }
}
