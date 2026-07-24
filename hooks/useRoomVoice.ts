"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// STUN gets most pairs connected; a TURN relay is the fallback for strict/
// symmetric NATs. Set NEXT_PUBLIC_TURN_URL (+ username/credential) to enable it —
// without TURN, some device pairs won't connect.
const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL;
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    ...(TURN_URL
      ? [
          {
            urls: TURN_URL,
            username: process.env.NEXT_PUBLIC_TURN_USERNAME,
            credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
          },
        ]
      : []),
  ],
};

export interface VoicePeer {
  id: string;
  name: string;
}

/**
 * Live voice for a rehearsal room — WebRTC peer-to-peer (1:1 mesh), signaled
 * over a dedicated Supabase Realtime channel. Opt-in (needs a mic gesture).
 *
 * NOTE: 1:1 audio can only be truly verified on two devices. Single-browser we
 * can confirm the mic prompt, peer setup, and clean teardown.
 */
export function useRoomVoice(roomId: string, myName: string) {
  const myId = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  ).current;

  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const localStream = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioEls = useRef<Map<string, HTMLAudioElement>>(new Map());
  const names = useRef<Map<string, string>>(new Map());

  const send = (payload: Record<string, unknown>) =>
    channelRef.current?.send({ type: "broadcast", event: "webrtc", payload: { from: myId, ...payload } });

  const teardownPeer = useCallback((peerId: string) => {
    pcs.current.get(peerId)?.close();
    pcs.current.delete(peerId);
    const el = audioEls.current.get(peerId);
    if (el) {
      el.srcObject = null;
      el.remove();
      audioEls.current.delete(peerId);
    }
    names.current.delete(peerId);
    setPeers((p) => p.filter((x) => x.id !== peerId));
  }, []);

  const createPeer = useCallback(
    (peerId: string, initiator: boolean) => {
      if (pcs.current.has(peerId)) return pcs.current.get(peerId)!;
      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcs.current.set(peerId, pc);

      localStream.current?.getTracks().forEach((t) => pc.addTrack(t, localStream.current!));

      pc.onicecandidate = (e) => {
        if (e.candidate) send({ to: peerId, kind: "candidate", candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        let el = audioEls.current.get(peerId);
        if (!el) {
          el = new Audio();
          el.autoplay = true;
          audioEls.current.set(peerId, el);
        }
        el.srcObject = e.streams[0];
        el.play().catch(() => {});
        setPeers((p) =>
          p.some((x) => x.id === peerId)
            ? p
            : [...p, { id: peerId, name: names.current.get(peerId) ?? "Partner" }]
        );
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) teardownPeer(peerId);
      };

      if (initiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => send({ to: peerId, kind: "offer", sdp: pc.localDescription }))
          .catch(() => setError("Couldn't start the call."));
      }
      return pc;
    },
    [teardownPeer]
  );

  const join = useCallback(async () => {
    if (joined || joining) return;
    setJoining(true);
    setError(null);
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setError("Mic access is needed for voice. Check your browser permissions.");
      setJoining(false);
      return;
    }

    const channel = supabase.channel(`voice:${roomId}`, {
      config: { presence: { key: myId } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<string, Array<{ name?: string }>>;
      for (const [peerId, metas] of Object.entries(state)) {
        if (peerId === myId) continue;
        names.current.set(peerId, metas[0]?.name ?? "Partner");
        // Deterministic initiator so only one side offers (no glare).
        if (!pcs.current.has(peerId)) createPeer(peerId, myId > peerId);
      }
      // drop peers who left
      for (const peerId of pcs.current.keys()) {
        if (!state[peerId]) teardownPeer(peerId);
      }
    });

    channel.on("broadcast", { event: "webrtc" }, async ({ payload }) => {
      if (!payload || payload.to !== myId) return;
      const from = payload.from as string;
      try {
        if (payload.kind === "offer") {
          const pc = createPeer(from, false);
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ to: from, kind: "answer", sdp: pc.localDescription });
        } else if (payload.kind === "answer") {
          await pcs.current.get(from)?.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        } else if (payload.kind === "candidate") {
          await pcs.current.get(from)?.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch {
        /* transient negotiation errors — ignore */
      }
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ name: myName });
        setJoined(true);
        setJoining(false);
      }
    });
  }, [joined, joining, roomId, myId, myName, createPeer, teardownPeer]);

  const leave = useCallback(() => {
    pcs.current.forEach((pc) => pc.close());
    pcs.current.clear();
    audioEls.current.forEach((el) => {
      el.srcObject = null;
      el.remove();
    });
    audioEls.current.clear();
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    setPeers([]);
    setJoined(false);
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    localStream.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  useEffect(() => () => leave(), [leave]);

  return { joined, joining, muted, peers, error, join, leave, toggleMute };
}
