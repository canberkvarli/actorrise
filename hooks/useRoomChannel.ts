"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface RoomParticipant {
  id: string;
  name: string;
  role: string | null;
}

/**
 * A rehearsal room over Supabase Realtime: presence (who's here) + broadcast for
 * everything that must feel instant — current line, scene, and ROLE claims.
 * (Presence sync is too laggy for role claims, so roles ride broadcast, with a
 * re-announce whenever someone joins so late arrivals catch up.) No DB.
 */
export function useRoomChannel(roomId: string, myName: string) {
  const myId = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  ).current;

  const [rawParticipants, setRawParticipants] = useState<{ id: string; name: string }[]>([]);
  const [roleMap, setRoleMap] = useState<Record<string, string | null>>({});
  const [sceneIndex, setSceneIndex] = useState(0);
  const [currentLine, setCurrentLine] = useState(0);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const myRoleRef = useRef<string | null>(null);

  useEffect(() => {
    if (!roomId || !myName) return;
    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: myId } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<string, Array<{ name?: string }>>;
      setRawParticipants(
        Object.entries(state).map(([id, metas]) => ({ id, name: metas[0]?.name ?? "Someone" }))
      );
      // Re-announce my role so anyone who just joined sees it immediately.
      if (myRoleRef.current) {
        channel.send({ type: "broadcast", event: "role", payload: { id: myId, role: myRoleRef.current } });
      }
    });

    channel.on("broadcast", { event: "role" }, ({ payload }) => {
      if (payload?.id) setRoleMap((m) => ({ ...m, [payload.id]: payload.role ?? null }));
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
        await channel.track({ name: myName });
      }
    });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setConnected(false);
    };
  }, [roomId, myId, myName]);

  const participants: RoomParticipant[] = useMemo(
    () => rawParticipants.map((p) => ({ ...p, role: roleMap[p.id] ?? null })),
    [rawParticipants, roleMap]
  );

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
      myRoleRef.current = role;
      setRoleMap((m) => ({ ...m, [myId]: role })); // reflect my own claim instantly
      channelRef.current?.send({ type: "broadcast", event: "role", payload: { id: myId, role } });
    },
    [myId]
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
