"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface RoomParticipant {
  id: string;
  name: string;
  role: string | null;
}

/**
 * A rehearsal room over Supabase Realtime: presence (who's here), a synced
 * current-line (broadcast), and role claims (tracked in presence). No DB — the
 * room is just the channel; the room id in the URL is the capability.
 */
export function useRoomChannel(roomId: string, myName: string) {
  const myId = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  ).current;

  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [currentLine, setCurrentLine] = useState(0);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!roomId || !myName) return;
    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: myId } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<string, Array<{ name?: string; role?: string | null }>>;
      const list: RoomParticipant[] = Object.entries(state).map(([id, metas]) => ({
        id,
        name: metas[0]?.name ?? "Someone",
        role: metas[0]?.role ?? null,
      }));
      setParticipants(list);
    });

    channel.on("broadcast", { event: "line" }, ({ payload }) => {
      if (typeof payload?.index === "number") setCurrentLine(payload.index);
    });

    channel.on("broadcast", { event: "scene" }, ({ payload }) => {
      if (typeof payload?.index === "number") {
        setSceneIndex(payload.index);
        setCurrentLine(0);
      }
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        await channel.track({ name: myName, role: null });
      }
    });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setConnected(false);
    };
  }, [roomId, myId, myName]);

  const setLine = useCallback((i: number) => {
    setCurrentLine(i);
    channelRef.current?.send({ type: "broadcast", event: "line", payload: { index: i } });
  }, []);

  const setScene = useCallback((i: number) => {
    setSceneIndex(i);
    setCurrentLine(0);
    channelRef.current?.send({ type: "broadcast", event: "scene", payload: { index: i } });
  }, []);

  const claimRole = useCallback(
    (role: string | null) => {
      setMyRole(role);
      channelRef.current?.track({ name: myName, role });
    },
    [myName]
  );

  return {
    myId,
    participants,
    sceneIndex,
    setScene,
    currentLine,
    setLine,
    myRole,
    claimRole,
    connected,
  };
}
