"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { theatreFontVars } from "@/lib/fonts/theatre";
import { trackEvent } from "@/lib/events";
import { useAuditions } from "@/hooks/useAuditions";
import { markIntroSeen, readIntroSeen, shouldAutoShowIntro } from "@/lib/auditionIntro";
import { AuditionsIntro } from "./AuditionsIntro";
import { DropBox } from "./DropBox";
import { TicketRail } from "./TicketRail";
import { OUTCOME_NOTE, PrepRoom } from "./PrepRoom";
import { CalendarLink } from "./CalendarLink";

/**
 * One shell for /auditions and /auditions/[id]. Desktop: rail left, prep room
 * right. Phone: the rail is the page; with an id it is the prep room alone.
 * Visibility is Tailwind only (see globals.css AUDITIONS note).
 */
export function AuditionsShell({ selectedId }: { selectedId: number | null }) {
  const params = useSearchParams();
  const { data: list = [], isLoading, isError, refetch, isFetching } = useAuditions();
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
  // The outcome email's confirm button lands on /auditions/{id}?logged=<o>&ar=after.
  const loggedParam = params.get("logged");
  const logged = selectedId != null && open?.id === selectedId && loggedParam && loggedParam in OUTCOME_NOTE
    ? OUTCOME_NOTE[loggedParam as keyof typeof OUTCOME_NOTE]
    : undefined;
  const failed = isError && list.length === 0;

  // The three-card intro opens by itself once per browser, and only on an
  // empty rail: someone with auditions already knows what this page is.
  const router = useRouter();
  const capture = useRef<HTMLDivElement>(null);
  const [intro, setIntro] = useState(false);
  const introChecked = useRef(false);
  useEffect(() => {
    if (introChecked.current || isLoading) return;
    // A beat after the rail paints, so the card lands on a page rather than a blank.
    const t = window.setTimeout(() => {
      introChecked.current = true;
      if (shouldAutoShowIntro({ loading: false, failed, count: list.length, seen: readIntroSeen() })) setIntro(true);
    }, 300);
    return () => window.clearTimeout(t);
  }, [isLoading, failed, list.length]);
  function introChange(next: boolean) {
    setIntro(next);
    if (!next) markIntroSeen();
  }
  // "Add my first audition": the paste box if it is showing, else whatever the
  // capture area has open (the fill-it-in card). Hidden on a phone prep room, so go to the rail.
  function toCapture() {
    const box = capture.current;
    const el = box?.querySelector<HTMLElement>("textarea:not([disabled])") ?? box?.querySelector<HTMLElement>("input:not([type=file]), textarea, button");
    if (!box || !el || box.offsetParent === null) return void router.push("/auditions");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }
  const retry = (
    <p className="aud-muted mt-6 text-sm">
      I couldn&apos;t load your auditions.{" "}
      <button type="button" className="underline underline-offset-2" disabled={isFetching} onClick={() => refetch()}>
        {isFetching ? "Trying again" : "Try again"}
      </button>
    </p>
  );

  return (
    <div className={`theatre-tokens theatre-auditions ${theatreFontVars} min-h-[calc(100dvh-65px)] overflow-x-clip`}>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[360px_1fr] md:py-10">
        <section className={`min-w-0 ${selectedId != null ? "max-md:hidden" : ""}`}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h1 className="aud-title text-4xl">Auditions</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <button type="button" className="aud-dir aud-muted text-xs underline-offset-2 hover:underline" onClick={() => setIntro(true)}>
                how this works
              </button>
              <CalendarLink />
            </div>
          </div>
          <div ref={capture}>
            <DropBox startOpen={startOpen} source={source} />
          </div>
          {isLoading ? (
            <p className="aud-muted mt-6 text-sm">Loading your rail</p>
          ) : failed ? (
            retry
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
          ) : failed && selectedId != null ? (
            <div className="md:hidden">{retry}</div>
          ) : !isLoading && !failed && selectedId != null ? (
            <p className="aud-muted text-sm">That audition isn&apos;t on your rail.</p>
          ) : null}
        </section>
      </div>
      <AuditionsIntro open={intro} onOpenChange={introChange} onCapture={toCapture} />
    </div>
  );
}
