"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

import api from "@/lib/api";
import { useMySharing } from "@/hooks/useClassShelf";
import { useUsageLimits } from "@/hooks/useSubscription";
import { trackEvent } from "@/lib/events";

type ClassLinkSummary = {
  code: string;
  active: boolean;
  school: string | null;
  days: number;
  max_uses: number;
  granted: number;
  joined: number;
  plan_ends_at?: string | null;
};

function planDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

const SITE = "actorrise.com";

const muted = { color: "var(--t-muted-dark)" };
const line = { borderColor: "var(--t-line-light-2)" };
const textLink = "font-semibold text-primary underline-offset-4 hover:underline";

/**
 * The made link: where it stands, the address to hand out, then the class in
 * three numbers. One sentence under the link says the next thing to do, so a
 * teacher never reads a paragraph to find out whether to send it yet.
 */
export function ClassLinkPanel({
  link,
  copied,
  onCopy,
  students,
  shared,
  unlockAt,
}: {
  link: ClassLinkSummary;
  copied: boolean;
  onCopy: () => void;
  students: number;
  shared: number;
  unlockAt: number | null;
}) {
  const next = !link.active
    ? "I switch new links on by hand when the address isn't a school's, usually within a day. Hold it until this says Live."
    : students === 0
      ? "Send it when the class is together. One class period, about ten minutes, and everyone's in."
      : null;

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-4">
        <h2 id="class-card-h" className="text-[17px] font-semibold leading-snug">
          Your class
        </h2>
        <span
          className="inline-flex items-center gap-2 border px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.08em]"
          style={link.active ? undefined : { ...line, ...muted }}
        >
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${link.active ? "bg-primary" : ""}`}
            style={link.active ? undefined : { background: "var(--t-muted-dark)" }}
          />
          {link.active ? <span className="text-primary">Live</span> : "Switching on"}
        </span>
      </div>

      <div className="mt-3 flex min-w-0 items-stretch border" style={line}>
        <code className="min-w-0 flex-1 break-all px-3 py-3 text-[14px] sm:text-[15px]">
          {SITE}/join/{link.code}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 border-l px-4 text-[14px] font-semibold transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-current"
          style={line}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {next && (
        <p className="mt-2 max-w-[62ch] text-[14px] leading-normal" style={muted}>
          {next}
        </p>
      )}

      <dl className="mt-5 grid grid-cols-1 border sm:grid-cols-3" style={line}>
        <Stat label="Students in" value={String(students)}>
          {unlockAt && students < unlockAt ? (
            <>
              <Meter of={unlockAt} filled={students} />
              <span>
                {unlockAt - students} more and your uploads are unlimited
              </span>
            </>
          ) : students > 0 ? (
            <Link href="/class" className={textLink}>
              See your class
            </Link>
          ) : (
            "Nobody yet"
          )}
        </Stat>
        <Stat label="Scenes shared" value={String(shared)}>
          <Link href="/practice" className={textLink}>
            {shared ? "Share more" : "Share a scene"}
          </Link>
        </Stat>
        <Stat label="Their Plus" value={link.plan_ends_at ? shortDate(link.plan_ends_at) : "1 month"}>
          {link.plan_ends_at ? `On your class plan, to ${planDate(link.plan_ends_at)}` : "Each, from the day they join, on me"}
        </Stat>
      </dl>
    </div>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div
      className="flex min-w-0 flex-col gap-1 border-b px-4 py-3.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
      style={line}
    >
      <dt className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={muted}>
        {label}
      </dt>
      <dd className="text-[26px] font-semibold leading-none tabular-nums">{value}</dd>
      <dd className="mt-1 flex flex-col gap-2 text-[14px] leading-snug" style={muted}>
        {children}
      </dd>
    </div>
  );
}

/** Sharp segments, one per student still to come. */
function Meter({ of, filled }: { of: number; filled: number }) {
  return (
    <span aria-hidden className="flex gap-1">
      {Array.from({ length: of }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 ${i < filled ? "bg-primary" : ""}`}
          style={i < filled ? undefined : { background: "var(--t-line-light-2)" }}
        />
      ))}
    </span>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * A teacher's own class link, in the library where a teacher lands after
 * signup. Until 2026-10-27 every link waited on Canberk answering an email; the
 * one class that came in (Gilroy, 36 students) signed up together in a single
 * class period the day the teacher had it. So the card hands over the link and
 * that one piece of advice, and nothing else.
 *
 * A school address gets a link that works at once; any other waits until
 * Canberk switches it on (services/class_links.make_own_link).
 */
export function TeacherClassCard() {
  const [link, setLink] = useState<ClassLinkSummary | null | undefined>(undefined);
  const [school, setSchool] = useState("");
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  // The count is the teacher's own; nobody else is ever told what is shared.
  const { data: sharing } = useMySharing(!!link);
  const { usage } = useUsageLimits();

  useEffect(() => {
    let live = true;
    api
      .get<{ link: ClassLinkSummary | null }>("/api/class-links/mine")
      .then(({ data }) => live && setLink(data.link))
      .catch(() => live && setLink(null));
    return () => {
      live = false;
    };
  }, []);

  if (link === undefined) return null;

  async function make() {
    if (making) return;
    setMaking(true);
    setFailed(false);
    try {
      const { data } = await api.post<{ link: ClassLinkSummary }>("/api/class-links/mine", {
        school: school.trim() || null,
      });
      setLink(data.link);
      trackEvent("class_link_self_made", { active: data.link.active });
    } catch {
      setFailed(true);
    } finally {
      setMaking(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(`https://${url}`);
      setCopied(true);
      trackEvent("class_link_copied", {});
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // no clipboard (an old browser, a non-https preview): the link is on screen to type
    }
  }

  const pill =
    "inline-flex h-11 shrink-0 items-center rounded-full px-5 text-[15px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-60";

  return (
    <section
      aria-labelledby="class-card-h"
      className="mt-10 border-t pt-6"
      style={{ borderColor: "var(--t-line-light-2)", color: "var(--t-text)" }}
    >
      {link === null ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <div className="min-w-0 max-w-[52ch]">
            <h2 id="class-card-h" className="text-[17px] font-semibold leading-snug">
              Bring your class in
            </h2>
            <p className="mt-1 text-[15px] leading-normal" style={{ color: "var(--t-muted-dark)" }}>
              Make a link for your students. Everyone who signs up through it gets Plus for a month, on me.
            </p>
            <label className="mt-3 block text-sm" style={{ color: "var(--t-muted-dark)" }}>
              <span className="sr-only">Your school or studio</span>
              <input
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                maxLength={120}
                placeholder="Your school or studio (optional)"
                className="h-11 w-full max-w-sm border bg-transparent px-3 text-[15px] outline-none focus-visible:border-current"
                style={{ borderColor: "var(--t-line-light-2)", color: "var(--t-text)" }}
              />
            </label>
            {failed && (
              <p className="mt-2 text-sm" style={{ color: "var(--t-muted-dark)" }}>
                That didn&apos;t go through. Try once more, or email canberk@actorrise.com and I&apos;ll make it.
              </p>
            )}
          </div>
          <button type="button" onClick={make} disabled={making} className={`${pill} bg-primary text-primary-foreground`}>
            {making ? "Making it" : "Make my class link"}
          </button>
        </div>
      ) : (
        <ClassLinkPanel
          link={link}
          copied={copied}
          onCopy={() => copy(`${SITE}/join/${link.code}`)}
          students={sharing?.students ?? link.granted}
          shared={sharing?.shared ?? 0}
          // What a class earns the teacher. Not shown to anyone whose plan is
          // already unlimited (Pro), nor once it is earned.
          unlockAt={
            sharing?.unlock_at && !sharing.unlimited_uploads && usage && usage.scripts_limit !== -1
              ? sharing.unlock_at
              : null
          }
        />
      )}
    </section>
  );
}
