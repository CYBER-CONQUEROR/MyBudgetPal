// src/components/ConvoButton.jsx
import { useEffect, useRef, useState } from "react";
import api from "../api/api.js";

/* --------------------------- tiny helpers --------------------------- */
function apiBase() {
  const base = api?.defaults?.baseURL || "";
  return base.replace(/\/$/, ""); // e.g. http://localhost:4000/api
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
function setTracksEnabled(stream, enabled) {
  if (!stream) return;
  stream.getAudioTracks().forEach((t) => (t.enabled = enabled));
}

/* ========================= Convo (WebRTC) ========================== */
export default function ConvoButton() {
  const [active, setActive] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  // keep mic muted while bot is talking to prevent self-VAD flips
  const [micMutedByAssistant, setMicMutedByAssistant] = useState(false);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const micStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // optional: track currently speaking assistant item (for future truncate)
  const lastAssistantItemRef = useRef(null);

  /* ------------------- hidden element for remote audio ------------------- */
  useEffect(() => {
    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);
    remoteAudioRef.current = audioEl;
    return () => {
      try {
        audioEl.pause();
        audioEl.srcObject = null;
        document.body.removeChild(audioEl);
      } catch { }
    };
  }, []);

  /* ---------------------------- start/stop ---------------------------- */
  useEffect(() => {
    if (!active) {
      teardown();
      return;
    }
    (async () => {
      setError("");
      setConnecting(true);
      try {
        await startRealtime();
      } catch (e) {
        setError(e?.message || String(e));
        setActive(false);
      } finally {
        setConnecting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  /* --------------------------- startRealtime --------------------------- */
  async function startRealtime() {
    // 1) mic
    micStreamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 },
      },
    });

    // 2) RTCPeerConnection
    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    // Add mic track
    micStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, micStreamRef.current));

    // Hook remote audio stream
    pc.ontrack = (e) => {
      const stream = e.streams?.[0];
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        // audio element events are not 100% reliable across browsers,
        // so we also drive speaking state from data-channel messages below.
      }
    };

    // 3) Data channel for realtime control/events
    const dc = pc.createDataChannel("oai-events");
    dcRef.current = dc;

    dc.onmessage = (ev) => {
      // We expect JSON events from the server
      try {
        const msg = JSON.parse(ev.data);
        const type = msg?.type || msg?.event;

        // --- assistant speaking lifecycle (server events) ---
        if (type === "output_audio_buffer.started") {
          setAssistantSpeaking(true);
          // Mute the mic while the bot is talking to avoid self-barge
          setTracksEnabled(micStreamRef.current, false);
          setMicMutedByAssistant(true);
        }
        if (
          type === "output_audio_buffer.cleared" ||
          type === "output_audio_buffer.stopped" ||
          type === "response.done" ||
          type === "response.completed" ||
          type === "response.cancelled"
        ) {
          setAssistantSpeaking(false);
          // Re-enable mic after bot finished
          if (micStreamRef.current && micMutedByAssistant) {
            setTracksEnabled(micStreamRef.current, true);
            setMicMutedByAssistant(false);
          }
        }

        // Optional: track last assistant item id (useful for truncate later)
        if (type === "conversation.item.created" && msg?.item?.role === "assistant") {
          lastAssistantItemRef.current = msg?.item?.id || null;
        }

        // If server VAD detects *user* speech while bot is talking,
        // we still cancel/flush to ensure immediate barge-in.
        if (type === "input_audio_buffer.speech_started") {
          // In theory we muted the mic while bot was speaking,
          // but if speech is detected (e.g. headset mic), force cancel.
          if (assistantSpeaking) {
            interruptNow(); // cancel + clear
          }
        }
      } catch {
        // ignore non-JSON pings
      }
    };

    // 4) SDP offer
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    // 5) Get ephemeral token from backend
    const tokRes = await fetch(`${apiBase()}/assist/realtime/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...userIdHeader() },
      body: JSON.stringify({}),
    });
    if (!tokRes.ok) throw new Error("Failed to get realtime token");
    const token = await tokRes.json();
    const clientSecret = token?.client_secret?.value;
    const tokenModel = token?.model || "gpt-4o-realtime-preview";
    if (!clientSecret) throw new Error("No client_secret in token");

    // 6) Send SDP to OpenAI Realtime and set answer
    const ans = await fetch(
      `https://api.openai.com/v1/realtime?model=${encodeURIComponent(tokenModel)}`,
      {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
          "OpenAI-Beta": "realtime=v1",
        },
      }
    );
    if (!ans.ok) {
      const detail = await ans.text();
      throw new Error(`SDP exchange failed: ${detail}`);
    }
    const answerSDP = await ans.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSDP });
  }

  /* ---------------------------- core control --------------------------- */
  function sendEvent(ev) {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    dc.send(JSON.stringify(ev));
  }

  // The correct order per docs: cancel generation, then clear the output buffer.
  function interruptNow() {
    // Unmute mic so the user can immediately speak
    if (micStreamRef.current) {
      setTracksEnabled(micStreamRef.current, true);
      setMicMutedByAssistant(false);
    }
    // Stop model generation + drop any queued audio
    sendEvent({ type: "response.cancel" });
    sendEvent({ type: "output_audio_buffer.clear" });

    // Locally pause any current playback to cut sound right away
    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.pause();
        const s = remoteAudioRef.current.srcObject;
        remoteAudioRef.current.srcObject = null;
        remoteAudioRef.current.srcObject = s; // reattach stream for next audio
      } catch { }
    }
    setAssistantSpeaking(false);
  }

  async function teardown() {
    try {
      if (dcRef.current && dcRef.current.readyState === "open") {
        // best-effort cancel
        sendEvent({ type: "response.cancel" });
        sendEvent({ type: "output_audio_buffer.clear" });
        dcRef.current.close();
      }
    } catch { }
    try {
      if (pcRef.current) pcRef.current.close();
    } catch { }
    try {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
    } catch { }
    try {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
      }
    } catch { }
    setAssistantSpeaking(false);
    setMicMutedByAssistant(false);
    lastAssistantItemRef.current = null;
  }

  /* ------------------------------ UI ------------------------------ */
  // Optional: Space key to interrupt quickly
  useEffect(() => {
    const onKey = (e) => {
      if (!active) return;
      if (e.code === "Space" && assistantSpeaking) {
        e.preventDefault();
        interruptNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, assistantSpeaking]);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setActive((x) => !x)}
        disabled={connecting}
        className={`rounded-lg px-3 py-2 text-sm font-semibold ${active ? "bg-rose-600 text-white" : "bg-indigo-600 text-white"
          }`}
        title={active ? "Stop Conversation" : "Start Conversation"}
      >
        {connecting ? "Connecting..." : active ? "Stop Convo" : "Start Convo"}
      </button>

      {/* Make sure this Interrupt button is included when active */}
      {active && (
        <button
          onClick={interruptNow}
          disabled={!assistantSpeaking}
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${assistantSpeaking ? "bg-amber-500 text-black" : "bg-gray-300 text-gray-600"
            }`}
          title="Interrupt the assistant and talk now (Space)"
        >
          Interrupt
        </button>
      )}

      {/* Show status text if needed */}
      {active && (
        <span className="text-xs ml-2">
          {assistantSpeaking ? "Assistant talking… mic muted" : "Listening"}
        </span>
      )}

      {/* Display any errors */}
      {error ? <span className="text-rose-600 text-sm ml-2">{error}</span> : null}
    </div>
  );
}
