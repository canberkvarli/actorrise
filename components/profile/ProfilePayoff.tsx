"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";

import api from "@/lib/api";
import type { Monologue } from "@/types/actor";
import { ScriptPagesSketch } from "@/components/brand/sketches";

/**
 * What the answers buy you, shown while you answer.
 *
 * The profile has always asked eleven questions on faith — "better profile =
 * better matches" — and then never showed a match. This pulls the recommender
 * onto the page itself, so picking an age range visibly changes which pieces
 * come back. That is the whole argument for filling the form, made by the form.
 *
 * Deliberately fed by a SIGNATURE of the fields the recommender actually reads,
 * not by every keystroke: typing a name must not fire a request per character,
 * and height has no effect on which monologue suits you.
 */

const DEBOUNCE_MS = 900;

type Props = {
  /** Fields that change the picks, joined. Refetches when this changes. */
  signature: string;
  /** Enough of a profile for the recommender to answer at all. */
  ready: boolean;
  /** The answers, phrased back to the actor. */
  because: string[];
};

function Piece({ m }: { m: Monologue }) {
  const mins = Math.round((m.estimated_duration_seconds || 0) / 60);
  const meta = [m.character_age_range, m.tone, mins ? `${mins} min` : null].filter(
    Boolean,
  );

  return (
    // These were a near-black box with a hairline round it, which read as an
    // unfinished placeholder rather than the reward for filling the form. A
    // lit left edge and a surface that actually sits above the page give them
    // the weight of a thing worth tapping.
    <Link
      href={`/monologue/${m.id}`}
      className="group relative flex h-full flex-col overflow-hidden border border-border bg-card p-4 pl-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_6px_28px_-16px_var(--primary)]"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-primary/45 transition-colors duration-200 group-hover:bg-primary"
      />
      <h3 className="font-typewriter line-clamp-1 text-[15px] font-semibold leading-snug text-foreground">
        {m.character_name}
      </h3>
      <p className="font-typewriter line-clamp-1 text-xs text-muted-foreground">
        {m.play_title}
      </p>
      {meta.length > 0 && (
        <p className="mt-auto pt-3 text-xs text-muted-foreground/70">
          {meta.join(" · ")}
        </p>
      )}
    </Link>
  );
}

type LanePiece = {
  id: number;
  character_name: string;
  play_title?: string | null;
  tone?: string | null;
  estimated_duration_seconds?: number | null;
};

type Lane = {
  line?: string | null;
  blurb?: string | null;
  credits_counted: number;
  needed: number;
  pieces: LanePiece[];
};

/**
 * The lane read, when the credits can carry one.
 *
 * This is the whole argument for filling in a résumé that currently feeds
 * nothing: three credits in, the app names the kind of actor they describe and
 * picks in that lane. Below the threshold, or if the model declines, `line` is
 * null and the block falls back to the profile picks it showed before, which is
 * why this never renders an error.
 */
function LaneRead({ lane }: { lane: Lane }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-brand text-xl font-medium text-foreground">
          Your lane
        </h2>
        <span className="text-xs text-muted-foreground/60">
          from {lane.credits_counted} credit{lane.credits_counted === 1 ? "" : "s"}
        </span>
      </div>

      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="stage-direction mt-3 text-base text-primary sm:text-lg"
      >
        {lane.line}
      </motion.p>
      {lane.blurb && (
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {lane.blurb}
        </p>
      )}

      {lane.pieces.length > 0 && (
        <>
          <p className="mt-6 text-xs uppercase tracking-[0.14em] text-muted-foreground/60">
            Speeches in that lane
          </p>
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.06 } } }}
            className="mt-3 grid gap-3 sm:grid-cols-3"
          >
            {lane.pieces.map((p) => (
              <motion.div
                key={p.id}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <Piece
                  m={
                    {
                      id: p.id,
                      character_name: p.character_name,
                      play_title: p.play_title ?? "",
                      tone: p.tone ?? undefined,
                      estimated_duration_seconds: p.estimated_duration_seconds ?? 0,
                    } as Monologue
                  }
                />
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
    </>
  );
}

export function ProfilePayoff({ signature, ready, because }: Props) {
  // Hold the signature still for a beat. Every select fires a save AND would
  // otherwise fire a recommendation request; the actor is usually mid-thought.
  const [settled, setSettled] = useState(signature);
  useEffect(() => {
    const id = setTimeout(() => setSettled(signature), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [signature]);

  const { data, isFetching } = useQuery({
    queryKey: ["profile-payoff", settled],
    queryFn: async () => {
      const res = await api.get<Monologue[]>(
        "/api/monologues/recommendations?limit=3&fast=true",
      );
      return res.data;
    },
    enabled: ready,
    // The recommender 400s without a profile; a retry storm helps nobody.
    retry: false,
    staleTime: 60_000,
  });

  // Array.isArray, not `?? []` — a non-array payload would throw in .map and
  // take the whole profile route down through the error boundary.
  const items = Array.isArray(data) ? data.slice(0, 3) : [];

  // The lane supersedes the profile picks when the credits can carry it.
  // Deliberately not `enabled: ready` — an actor can have credits without a
  // finished profile, and the credits are the better signal of the two.
  const { data: lane } = useQuery({
    queryKey: ["actor-lane"],
    queryFn: async () => (await api.get<Lane>("/api/resume/lane")).data,
    retry: false,
    staleTime: 60_000,
  });

  if (lane?.line) {
    return (
      <section className="mt-10 border-t border-border/70 pt-8">
        <LaneRead lane={lane} />
      </section>
    );
  }

  return (
    <section className="mt-10 border-t border-border/70 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-brand text-xl font-medium text-foreground">
          What this gets you
        </h2>
        <AnimatePresence mode="wait">
          <motion.p
            key={because.join("|") || "empty"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="stage-direction text-xs text-muted-foreground/70"
          >
            {because.length > 0
              ? `(because you said ${because.join(", ")}.)`
              : "(tell me who you are and I'll pick.)"}
          </motion.p>
        </AnimatePresence>
      </div>

      {!ready ? (
        <div className="mt-6 flex flex-col items-center gap-3 border border-dashed border-border/70 px-4 py-10 text-center">
          <ScriptPagesSketch size={56} className="text-muted-foreground/50" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Give me an age range and what you act in, and pieces picked for you
            will show up right here.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[104px] border border-border/40 bg-muted/30" />
          ))}
        </div>
      ) : (
        <motion.div
          key={settled}
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          className={`mt-6 grid gap-3 sm:grid-cols-3 ${isFetching ? "opacity-60" : ""} transition-opacity`}
        >
          {items.map((m) => (
            <motion.div
              key={m.id}
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <Piece m={m} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}
