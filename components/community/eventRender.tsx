"use client";

import { useState } from "react";
import Image from "next/image";
import type { FeedEvent } from "@/hooks/useCommunityFeed";

/* Shared renderers for the activity feed — used by both the compact Callboard
   panel (on the /practice landing) and the full feed view. */

function genderNoun(g?: string): string | null {
  const s = (g || "").toLowerCase();
  if (s.startsWith("f") || s === "woman") return "woman";
  if (s.startsWith("m") || s === "man") return "man";
  return null;
}

function pronoun(g?: string): string {
  const n = genderNoun(g);
  return n === "woman" ? "her" : n === "man" ? "his" : "their";
}

// A typewriter span for any piece/play title — matches the app's rule that
// monologue titles render in the typewriter face.
function Title({ children }: { children: React.ReactNode }) {
  // align-baseline: Courier's line box differs from the sans around it, so in
  // any flex/inline-block context the title would otherwise ride high.
  return <span className="font-typewriter align-baseline text-foreground/90">{children}</span>;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** The event sentence, with titles styled in typewriter. */
export function EventLine({ e }: { e: FeedEvent }) {
  const p = e.payload;
  switch (e.event_type) {
    case "joined":
      return <>joined ActorRise{e.city ? <> from {e.city}</> : null}</>;
    case "searched": {
      const g = genderNoun(p.gender);
      const age = p.age_range;
      const piece = p.tone ? `a ${p.tone} monologue` : "a monologue";
      let who: React.ReactNode = null;
      if (g) {
        who = <> for a {g}{age ? ` in ${pronoun(p.gender)} ${age}` : ""}</>;
      } else if (age) {
        who = <> for someone in their {age}</>;
      }
      return <>is looking for {piece}{who}</>;
    }
    case "viewed":
      return p.title ? <>is reading <Title>{p.title}</Title></> : <>is reading a monologue</>;
    case "bookmarked":
      return p.title ? <>saved <Title>{p.title}</Title></> : <>saved a monologue</>;
    case "worked":
      return <>ran a monologue out loud</>;
    case "rehearsed":
      return <>rehearsed a scene{p.line_count ? <> · {p.line_count} lines</> : null}</>;
    case "rehearsing":
      return p.title ? (
        <>is rehearsing <Title>{p.title}</Title> with a partner</>
      ) : (
        <>is rehearsing a scene with a partner</>
      );
    case "shared":
      return p.title ? (
        <>shared <Title>{p.title}</Title> with the community</>
      ) : (
        <>shared a script with the community</>
      );
    case "milestone":
      return <>hit {p.milestone_n} rehearsals</>;
    // "went_plus" is retired: it published billing status next to a real name
    // and face. Filtered server-side too; falls through to null if one slips by.
    case "trending":
      return (
        <>
          <Title>{p.title}</Title> is trending
          {p.reader_count ? <> · {p.reader_count} actors reading it</> : null}
        </>
      );
    default:
      return null;
  }
}

/** Where the card's action chip walks the actor — into the paywall funnel. */
export function chipFor(e: FeedEvent): { label: string; href: string } | null {
  const id = e.payload.monologue_id;
  switch (e.event_type) {
    case "viewed":
    case "bookmarked":
    case "trending":
      return { label: "Read this", href: id ? `/monologue/${id}` : "/monologues" };
    case "searched":
      return { label: "Find yours", href: "/monologues" };
    case "worked":
    case "rehearsed":
      return { label: "Rehearse", href: "/rehearse" };
    default:
      return null; // joined / went_plus / milestone are social proof, not actions
  }
}

export function Avatar({ e, size = 44 }: { e: FeedEvent; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initial = (e.name?.[0] || "?").toUpperCase();
  const showImg = e.headshot_url && !failed;
  const dim = { width: size, height: size };
  return (
    <div className="relative shrink-0" style={dim}>
      <div className="absolute inset-0 rounded-full bg-[var(--stage-glow,oklch(0.72_0.17_55))] opacity-20 blur-md" />
      {showImg ? (
        <Image
          src={e.headshot_url as string}
          alt=""
          width={size}
          height={size}
          unoptimized
          onError={() => setFailed(true)}
          className="relative rounded-full object-cover ring-1 ring-primary/30"
          style={dim}
        />
      ) : (
        <span
          className="relative flex items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary/90 font-semibold text-background ring-1 ring-primary/30"
          style={{ ...dim, fontSize: size * 0.32 }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
