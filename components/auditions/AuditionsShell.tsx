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
import { CalendarOffer, CalendarPanel, CalendarToggle } from "./CalendarLink";
import { GhostTicket } from "./GhostTicket";
import { takeCalendarOffer } from "@/lib/calendarFeed";

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
  // An empty rail turns the page into one ask: the capture box, centre stage.
  const empty = !isLoading && !failed && list.length === 0 && selectedId == null;

  // Saving the first audition leaves a note for the page it lands on: offer
  // the calendar once, under the new ticket.
  const [calOffer, setCalOffer] = useState<number | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  useEffect(() => {
    const id = takeCalendarOffer();
    if (id != null) setCalOffer(id);
  }, []);
  const offerShown = calOffer != null && list.some((a) => a.id === calOffer);
  const offer = offerShown ? <CalendarOffer onDone={() => setCalOffer(null)} /> : null;

  // The three-card intro opens by itself once per browser, and only on an
  // empty rail: someone with auditions already knows what this page is. Nor
  // when they came here to add one (?new=1, onboarding): they are mid-task, and
  // leaving it unseen lets it open on a later empty visit instead.
  const router = useRouter();
  const capture = useRef<HTMLDivElement>(null);
  const [intro, setIntro] = useState(false);
  const introChecked = useRef(false);
  const adding = startOpen || source === "onboarding";
  useEffect(() => {
    if (introChecked.current || isLoading) return;
    // A beat after the rail paints, so the card lands on a page rather than a blank.
    const t = window.setTimeout(() => {
      introChecked.current = true;
      if (shouldAutoShowIntro({ loading: false, failed, count: list.length, seen: readIntroSeen(), adding })) setIntro(true);
    }, 300);
    return () => window.clearTimeout(t);
  }, [isLoading, failed, list.length, adding]);
  function introChange(next: boolean) {
    setIntro(next);
    if (!next) markIntroSeen();
  }
  // "Add my first audition". Focus lands synchronously inside the click, because
  // iOS only raises the keyboard for a focus() made in the tap itself. The paste
  // box if it is showing, else the first field of whatever the capture area has
  // open (the fill-it-in card). Hidden on a phone prep room, so go to the rail.
  function captureTarget() {
    const box = capture.current;
    const el = box?.querySelector<HTMLElement>("textarea:not([disabled])")
      ?? box?.querySelector<HTMLElement>("input:not([type=file]):not([disabled]), textarea:not([disabled])")
      ?? box?.querySelector<HTMLElement>("button");
    return box && el && box.offsetParent !== null ? { box, el } : null;
  }
  function focusCapture(): boolean {
    const t = captureTarget();
    if (!t) return false;
    t.el.focus({ preventScroll: true });
    return true;
  }
  // After the dialog has gone (its scroll lock with it): bring the box into view.
  function revealCapture() {
    const t = captureTarget();
    if (!t) return void router.push("/auditions");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    t.box.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    if (document.activeElement !== t.el) t.el.focus({ preventScroll: true });
  }
  const retry = (
    <p className="aud-muted mt-6 text-sm">
      I couldn&apos;t load your auditions.{" "}
      <button type="button" className="underline underline-offset-2" disabled={isFetching} onClick={() => refetch()}>
        {isFetching ? "Trying again" : "Try again"}
      </button>
    </p>
  );

  const howItWorks = (
    <button type="button" className="aud-link aud-cap-muted aud-focus text-sm font-medium" onClick={() => setIntro(true)}>
      how this works
    </button>
  );

  return (
    <div className={`theatre-tokens theatre-auditions ${theatreFontVars} min-h-[calc(100dvh-65px)] overflow-x-clip`}>
      {empty ? (
        <div className="mx-auto max-w-[1280px] px-4 pb-28 pt-6 sm:px-6 md:pb-20 md:pt-10 lg:px-8">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="aud-title text-[32px] leading-none">Auditions</h1>
            {howItWorks}
          </div>
          <section aria-labelledby="aud-ask" className="aud-rise mx-auto mt-10 flex max-w-[760px] flex-col items-center text-center md:mt-16">
            <p className="aud-hero-dir aud-cap-muted text-lg md:text-xl">(house is dark. one lamp on.)</p>
            <h2 id="aud-ask" className="aud-hero-h mt-2.5">
              Got one <em>coming up?</em>
            </h2>
            <p className="mt-5 max-w-[30em] text-[17px] leading-normal md:text-[19px]">
              Paste the casting email or drop the sides. I&apos;ll read it into a ticket and keep you on it.
            </p>
            <div ref={capture} className="mt-9 w-full max-w-[720px] text-left">
              <DropBox startOpen={startOpen} source={source} size="hero" firstOne />
            </div>
            <GhostTicket />
          </section>
        </div>
      ) : (
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[360px_1fr] md:py-10">
        <section className={`min-w-0 ${selectedId != null ? "max-md:hidden" : ""}`}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h1 className="aud-title text-4xl">Auditions</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {howItWorks}
              {list.length > 0 && <CalendarToggle open={calOpen} onToggle={() => setCalOpen((v) => !v)} />}
            </div>
          </div>
          {calOpen && list.length > 0 && <CalendarPanel />}
          <div ref={capture} className="mb-2">
            <DropBox startOpen={startOpen} source={source} size="compact" firstOne={list.length === 0} />
          </div>
          {isLoading ? (
            <p className="aud-muted mt-6 text-sm">Loading your rail</p>
          ) : failed ? (
            retry
          ) : list.length === 0 ? (
            <p className="aud-muted mt-6 text-sm">Paste the next casting email you get. I&apos;ll handle the reminders.</p>
          ) : (
            <>
              <TicketRail list={list} openId={open?.id ?? null} now={now} />
              {offer && <div className="mt-5">{offer}</div>}
            </>
          )}
        </section>

        <section className={`min-w-0 ${selectedId == null ? "max-md:hidden" : ""}`}>
          {selectedId != null && (
            <Link href="/auditions" className="aud-dir mb-3 inline-block text-xs md:hidden">all auditions</Link>
          )}
          {offer && <div className="mb-4 md:hidden">{offer}</div>}
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
      )}
      <AuditionsIntro open={intro} onOpenChange={introChange} onCapture={focusCapture} onCaptured={revealCapture} firstOne={list.length === 0} />
    </div>
  );
}
