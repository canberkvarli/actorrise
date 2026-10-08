"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";

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
 * One shell for /auditions and /auditions/[id]. One column on every width:
 * the open audition as one big ticket (the next one up, unless an id picks
 * another), the rest as reels under it.
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
  const loggedNote = loggedParam && loggedParam in OUTCOME_NOTE ? OUTCOME_NOTE[loggedParam as keyof typeof OUTCOME_NOTE] : undefined;
  const logged = selectedId != null && open?.id === selectedId ? loggedNote : undefined;
  const failed = isError && list.length === 0;
  // An empty rail turns the page into one ask: the capture box, centre stage.
  const empty = !isLoading && !failed && list.length === 0 && selectedId == null;
  // Until the list arrives, /auditions shows neither layout's capture box: a
  // box mounted for one layout and swapped for the other would drop whatever
  // was typed into it, and the swap itself is a flash.
  const pending = isLoading && list.length === 0 && selectedId == null;

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
  const cameToAdd = startOpen || source === "onboarding";
  useEffect(() => {
    if (introChecked.current || isLoading) return;
    // A beat after the rail paints, so the card lands on a page rather than a blank.
    const t = window.setTimeout(() => {
      introChecked.current = true;
      if (shouldAutoShowIntro({ loading: false, failed, count: list.length, seen: readIntroSeen(), adding: cameToAdd })) setIntro(true);
    }, 300);
    return () => window.clearTimeout(t);
  }, [isLoading, failed, list.length, cameToAdd]);
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
    if (!captureTarget() && !empty) flushSync(() => setAdding(true));
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

  // With tickets on the rail the prep room is the page, so the capture box
  // waits behind a button. It stays mounted while hidden: closing it mid-draft
  // keeps what was typed. A new ticket closes it.
  const [adding, setAdding] = useState(startOpen);
  const count = list.length;
  const lastCount = useRef(count);
  useEffect(() => {
    if (count > lastCount.current) setAdding(false);
    lastCount.current = count;
  }, [count]);
  function openAdd() {
    flushSync(() => setAdding(true));
    captureTarget()?.el.focus();
  }

  const howItWorks = (
    <button
      type="button"
      className="aud-pill aud-help aud-focus inline-flex h-11 shrink-0 items-center gap-2.5 pl-1.5 pr-4 text-[15px]"
      onClick={() => setIntro(true)}
    >
      <span aria-hidden className="aud-help-q">?</span>
      How it works
    </button>
  );

  return (
    <div className={`theatre-tokens theatre-auditions ${theatreFontVars} min-h-[calc(100dvh-65px)] overflow-x-clip`}>
      {pending ? (
        <div className="mx-auto max-w-[1280px] px-4 pb-28 pt-6 sm:px-6 md:pb-20 md:pt-10 lg:px-8">
          <p className="aud-cap-muted mt-10 text-center text-sm md:mt-16" role="status">Loading your rail</p>
        </div>
      ) : empty ? (
        <div className="mx-auto max-w-[1280px] px-4 pb-28 pt-6 sm:px-6 md:pb-20 md:pt-10 lg:px-8">
          <div className="flex justify-end">{howItWorks}</div>
          {loggedNote && (
            <p role="status" className="aud-dir aud-muted mt-4 text-[13.5px]">{loggedNote}</p>
          )}
          <section aria-labelledby="aud-ask" className="aud-rise mx-auto mt-4 flex max-w-[760px] flex-col items-center text-center md:mt-6">
            <p className="aud-hero-dir aud-cap-muted text-lg md:text-xl">(house is dark. one lamp on.)</p>
            <h1 id="aud-ask" className="aud-hero-h mt-2.5">
              <span className="sr-only">Auditions. </span>Got one <em>coming up?</em>
            </h1>
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
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-20 md:pt-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h1 className="aud-title text-4xl">Auditions</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {list.length > 0 && <CalendarToggle open={calOpen} onToggle={() => setCalOpen((v) => !v)} />}
            <button
              type="button"
              aria-label="How it works"
              title="How it works"
              className="aud-help-q aud-focus"
              onClick={() => setIntro(true)}
            >
              ?
            </button>
            {!adding && (
              <button
                type="button"
                className="aud-pill aud-help aud-focus inline-flex h-11 items-center gap-2 px-4 text-[15px]"
                aria-controls="aud-add"
                aria-expanded={false}
                onClick={openAdd}
              >
                <span aria-hidden className="text-xl leading-none">+</span>
                Add an audition
              </button>
            )}
          </div>
        </div>
        {calOpen && list.length > 0 && <CalendarPanel />}
        <div id="aud-add" ref={capture} className={adding ? "mx-auto mb-8 max-w-2xl" : "hidden"}>
          <div className="mb-2 flex justify-end">
            <button type="button" className="aud-link aud-cap-muted aud-focus text-sm font-medium" onClick={() => setAdding(false)}>
              close
            </button>
          </div>
          <DropBox startOpen={startOpen} source={source} size="compact" firstOne={list.length === 0} />
        </div>
        {logged && (
          <p role="status" className="aud-dir aud-muted mb-3 text-[13.5px]">{logged}</p>
        )}
        {isLoading ? (
          <p className="aud-muted mt-6 text-sm">Loading your rail</p>
        ) : failed ? (
          retry
        ) : open ? (
          <PrepRoom a={open} now={now} next={open.id === fallback?.id && open.scope === "upcoming"} />
        ) : selectedId != null ? (
          <p className="aud-muted text-sm">That audition isn&apos;t on your rail.</p>
        ) : null}
        {offer && <div className="mt-6">{offer}</div>}
        {list.length > 1 && (
          <div className="mt-12">
            <TicketRail list={list} openId={open?.id ?? null} now={now} />
          </div>
        )}
      </div>
      )}
      <AuditionsIntro open={intro} onOpenChange={introChange} onCapture={focusCapture} onCaptured={revealCapture} firstOne={list.length === 0} />
    </div>
  );
}
