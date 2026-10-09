"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";

import { theatreFontVars } from "@/lib/fonts/theatre";
import { trackEvent } from "@/lib/events";
import { useAuditions } from "@/hooks/useAuditions";
import { markIntroSeen } from "@/lib/auditionIntro";
import { AuditionsIntro } from "./AuditionsIntro";
import { DropBox } from "./DropBox";
import { AuditionFile, OUTCOME_NOTE } from "./AuditionFile";
import { CalendarOffer, CalendarPanel, CalendarToggle } from "./CalendarLink";
import { FileSkeleton } from "./FileSkeleton";
import { IntroLoop } from "./IntroLoop";
import { RecentlyDeleted } from "./FileAside";
import { takeCalendarOffer } from "@/lib/calendarFeed";

/**
 * One shell for /auditions and /auditions/[id]: the open audition as its file
 * (the next one up, unless an id picks another), with every other audition in
 * the file's quiet side column.
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

  // The empty page runs How it works inline (IntroLoop), so the dialog only
  // opens from the ? once there are auditions.
  const router = useRouter();
  const capture = useRef<HTMLDivElement>(null);
  const [intro, setIntro] = useState(false);
  const [introStep, setIntroStep] = useState(0);
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
    // A folded box is still laid out (it animates shut), so inert is what says it's away.
    return box && el && box.offsetParent !== null && !box.closest("[inert]") ? { box, el } : null;
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

  return (
    <div className={`theatre-tokens theatre-auditions ${theatreFontVars} min-h-[calc(100dvh-65px)] overflow-x-clip`}>
      {pending ? (
        // Same frame as the rail below, top bar's height included, so nothing jumps when it lands.
        <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-20 md:pt-10">
          <div aria-hidden className="mb-6 h-10" />
          <FileSkeleton />
        </div>
      ) : empty ? (
        <div className="mx-auto max-w-[1280px] px-4 pb-28 pt-6 sm:px-6 md:pb-20 md:pt-10 lg:px-8">
          {loggedNote && (
            <p role="status" className="aud-dir aud-muted mt-4 text-[13.5px]">{loggedNote}</p>
          )}
          <section aria-labelledby="aud-ask" className="aud-rise mx-auto mt-10 flex max-w-[760px] flex-col items-center text-center md:mt-14">
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
            <RecentlyDeleted startOpen className="mt-8 w-full max-w-[440px] text-left" />
            <div className="mt-12 w-full max-w-[720px] md:mt-14">
              <IntroLoop
                onExpand={(step) => {
                  setIntroStep(step);
                  setIntro(true);
                }}
              />
            </div>
          </section>
        </div>
      ) : (
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-20 md:pt-10">
        <div className="mb-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <h1 className="sr-only">Auditions</h1>
          {list.length > 0 && <CalendarToggle open={calOpen} onToggle={() => setCalOpen((v) => !v)} />}
          <button
            type="button"
            aria-label="How it works"
            title="How it works"
            className="aud-help-q aud-focus"
            onClick={() => {
              setIntroStep(0);
              setIntro(true);
            }}
          >
            ?
          </button>
          <button
            type="button"
            className="aud-quiet-chip aud-add-chip aud-focus inline-flex h-10 items-center gap-1.5 px-4 text-[14px] font-semibold"
            aria-controls="aud-add"
            aria-expanded={adding}
            onClick={() => (adding ? setAdding(false) : openAdd())}
          >
            <span aria-hidden className="aud-add-plus text-lg leading-none" data-open={adding ? "true" : "false"}>+</span>
            {adding ? "Close" : "Add an audition"}
          </button>
        </div>
        {list.length > 0 && (
          <div className="aud-fold" data-open={calOpen ? "true" : "false"} inert={!calOpen}>
            <div className="flex justify-end">
              <CalendarPanel onClose={() => setCalOpen(false)} />
            </div>
          </div>
        )}
        <div className="aud-fold" data-open={adding ? "true" : "false"} inert={!adding}>
          <div id="aud-add" ref={capture} className="mx-auto mb-8 w-full max-w-2xl">
            <div className="mb-2 flex justify-end">
              <button type="button" className="aud-link aud-cap-muted aud-focus text-sm font-medium" onClick={() => setAdding(false)}>
                close
              </button>
            </div>
            <DropBox startOpen={startOpen} source={source} size="compact" firstOne={list.length === 0} />
          </div>
        </div>
        {logged && (
          <p role="status" className="aud-dir aud-muted mb-3 text-[13.5px]">{logged}</p>
        )}
        {isLoading ? (
          <FileSkeleton />
        ) : failed ? (
          retry
        ) : open ? (
          <AuditionFile
            key={open.id}
            a={open}
            list={list}
            now={now}
            next={open.id === fallback?.id && open.scope === "upcoming"}
            startEditing={params.get("edit") === "1" && open.id === selectedId}
          />
        ) : selectedId != null ? (
          <p className="aud-muted text-sm">That audition isn&apos;t on your rail.</p>
        ) : null}
        {offer && <div className="aud-row-in mt-6 max-w-[440px]">{offer}</div>}
      </div>
      )}
      <AuditionsIntro startAt={introStep} open={intro} onOpenChange={introChange} onCapture={focusCapture} onCaptured={revealCapture} firstOne={list.length === 0} />
    </div>
  );
}
