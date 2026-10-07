"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { theatreFontVars } from "@/lib/fonts/theatre";
import { trackEvent } from "@/lib/events";
import { useAuditions } from "@/hooks/useAuditions";
import { DropBox } from "./DropBox";
import { TicketRail } from "./TicketRail";
import { PrepRoom } from "./PrepRoom";
import { CalendarLink } from "./CalendarLink";

/** What the outcome email's confirm button lands on: /auditions/{id}?logged=<o>&ar=after. */
const LOGGED_NOTE: Record<string, string> = {
  good: "Got it, it felt good. Fingers crossed for you.",
  callback: "A callback! I moved it to Callback. Go get it.",
  no: "Got it. Not this time, on to the next one.",
};

/**
 * One shell for /auditions and /auditions/[id]. Desktop: rail left, prep room
 * right. Phone: the rail is the page; with an id it is the prep room alone.
 * Visibility is Tailwind only (see globals.css AUDITIONS note).
 */
export function AuditionsShell({ selectedId }: { selectedId: number | null }) {
  const params = useSearchParams();
  const { data: list = [], isLoading } = useAuditions();
  const now = useMemo(() => new Date(), [list]); // eslint-disable-line react-hooks/exhaustive-deps
  const fallback = list.find((a) => a.scope === "upcoming") ?? list[0] ?? null;
  const open = (selectedId != null ? list.find((a) => a.id === selectedId) : fallback) ?? null;

  // Once per landing URL, so a re-render or a refetch never counts the same click twice.
  const tracked = useRef<string | null>(null);
  useEffect(() => {
    const key = `${selectedId}?${params.toString()}`;
    if (tracked.current === key) return;
    tracked.current = key;
    const ar = params.get("ar");
    if (ar && selectedId) trackEvent("audition_reminder_clicked", { audition_id: selectedId, moment: ar });
    if (params.get("utm_campaign") === "auditions_winback") trackEvent("audition_strip_clicked", { surface: "winback_email" });
    if (params.get("from") === "login" && selectedId) trackEvent("audition_landing_shown", { audition_id: selectedId });
  }, [params, selectedId]);

  const startOpen = params.get("new") === "1";
  const source = params.get("from") === "onboarding" ? "onboarding" : "parse";
  const logged = selectedId != null && open?.id === selectedId ? LOGGED_NOTE[params.get("logged") ?? ""] : undefined;

  return (
    <div className={`theatre-tokens theatre-auditions ${theatreFontVars} min-h-[calc(100dvh-65px)] overflow-x-clip`}>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[360px_1fr] md:py-10">
        <section className={`min-w-0 ${selectedId != null ? "max-md:hidden" : ""}`}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h1 className="aud-title text-4xl">Auditions</h1>
            <CalendarLink />
          </div>
          <DropBox startOpen={startOpen} source={source} />
          {isLoading ? (
            <p className="aud-muted mt-6 text-sm">Loading your rail</p>
          ) : list.length === 0 ? (
            <div className="mt-6">
              <div data-empty="true" className="aud-ticket flex min-h-[84px] items-center justify-center opacity-60">
                <p className="aud-dir text-xs">your next one goes here</p>
              </div>
              <p className="aud-muted mt-4 text-sm">Paste the next casting email you get. I&apos;ll handle the reminders.</p>
            </div>
          ) : (
            <TicketRail list={list} openId={open?.id ?? null} now={now} />
          )}
        </section>

        <section className={`min-w-0 ${selectedId == null ? "max-md:hidden" : ""}`}>
          {selectedId != null && (
            <Link href="/auditions" className="aud-dir mb-3 inline-block text-xs md:hidden">all auditions</Link>
          )}
          {logged && (
            <p role="status" className="aud-dir aud-muted mb-3 text-[12px]">{logged}</p>
          )}
          {open ? (
            <PrepRoom a={open} now={now} />
          ) : !isLoading && selectedId != null ? (
            <p className="aud-muted text-sm">That audition isn&apos;t on your rail.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
