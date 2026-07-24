"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCommunityFeed } from "@/hooks/useCommunityFeed";
import { Avatar, EventLine } from "./eventRender";

/**
 * The lit marquee — after results take the stage, a slim strip keeps the buzz
 * alive, rotating through recent activity one line at a time. Slides in from the
 * top when it mounts (i.e. when results appear).
 */
export function CallboardTicker() {
  const { data } = useCommunityFeed(12);
  const events = data?.events ?? [];
  const [i, setI] = useState(0);

  useEffect(() => {
    if (events.length <= 1) return;
    const t = setInterval(() => setI((n) => (n + 1) % events.length), 4200);
    return () => clearInterval(t);
  }, [events.length]);

  if (events.length === 0) return null;
  const e = events[i % events.length];

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="mb-6 flex items-center gap-3 overflow-hidden rounded-full border border-border/50 bg-card/40 px-3 py-2 backdrop-blur-sm"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>

      <div className="relative min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={e.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex items-center gap-2"
          >
            <Avatar e={e} size={22} />
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{e.name}</span>{" "}
              <EventLine e={e} />
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <Link
        href="/callboard"
        className="shrink-0 text-xs font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        the room →
      </Link>
    </motion.div>
  );
}
