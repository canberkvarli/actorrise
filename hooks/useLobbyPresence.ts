"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Lightweight "who's here right now" presence for a shared space (e.g. the
 * Green Room lobby). Everyone viewing joins the same channel; returns the live
 * count + first names. Manufactures presence so the room never feels dead.
 */
export function useLobbyPresence(channelName: string, myName: string) {
  const myId = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  ).current;

  const [count, setCount] = useState(0);
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!myName) return;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: myId } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<string, Array<{ name?: string }>>;
      const entries = Object.values(state);
      setCount(entries.length);
      setNames(entries.map((m) => m[0]?.name ?? "Someone"));
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await channel.track({ name: myName });
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, myId, myName]);

  return { count, names };
}
