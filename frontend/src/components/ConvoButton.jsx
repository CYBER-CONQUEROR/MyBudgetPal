import { useEffect, useRef, useState } from "react";
import api from "../api/api.js";

function apiBase() {
  const base = api.defaults.baseURL || "";
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

export default function ConvoButton() {
  const [active, setActive] = useState(false);
  const pcRef = useRef(null);
  const micStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const dataChannelRef = useRef(null);

  useEffect(() => {
    if (!active) {
      stopSession();
      return;
    }
    startSession();
    return () => stopSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function startSession() {
    try {
      const res = await fetch(`${apiBase()}/assist/realtime/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...userIdHeader() },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error("Failed to fetch realtime token: " + t);
      }
      const data = await res.json();
      const EPHEMERAL_KEY = data?.client_secret?.value;
      if (!EPHEMERAL_KEY) throw new Error("No ephemeral token");

      // mic
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // remote audio
      const audioEl = new Audio();
      audioEl.autoplay = true;
      remoteAudioRef.current = audioEl;
      pc.ontrack = (e) => (audioEl.srcObject = e.streams[0]);

      // add mic
      micStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, micStreamRef.current));

      // optional data channel
      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      // offer -> OpenAI Realtime
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);

      const base = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      const sdpResponse = await fetch(`${base}?model=${model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!sdpResponse.ok) {
        const txt = await sdpResponse.text();
        throw new Error("SDP exchange failed: " + txt);
      }
      const answerSDP = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSDP });
    } catch (err) {
      console.error("[realtime] start error:", err);
      stopSession();
      setActive(false);
    }
  }

  function stopSession() {
    try { dataChannelRef.current?.close(); } catch {}
    dataChannelRef.current = null;

    try {
      pcRef.current?.getSenders().forEach((s) => s.track && s.track.stop());
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;

    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    micStreamRef.current = null;

    remoteAudioRef.current = null;
  }

  return (
    <button
      onClick={() => setActive((x) => !x)}
      className={`rounded-lg px-3 py-2 text-sm font-semibold ${
        active ? "bg-rose-600 text-white" : "bg-indigo-600 text-white"
      }`}
      title={active ? "Stop Conversation" : "Start Conversation"}
    >
      {active ? "Stop Convo" : "Start Convo"}
    </button>
  );
}
