"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconArrowUp, IconX } from "@tabler/icons-react";
import { CueMark } from "@/components/cue/CueMark";
import { api } from "@/lib/api";
import { linkify, sendToCue, type CueThread } from "@/lib/cue";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialWords } from "@/hooks/useTrialWords";
import { plusHref } from "@/lib/trial";
import { trackPaywallCtaClicked, trackUpgradeModalViewed } from "@/lib/analytics";

type Msg = { role: "user" | "assistant"; content: string };

// Said once, the first time the sheet opens on an empty day. Cue itself is
// told not to repeat it.
const HELLO = "I'm Cue, Canberk's assistant. He reads everything, and I cover while he's away.";

const STARTERS = [
  "Find me a monologue",
  "How does ScenePartner work?",
  "What do I get with Plus?",
  "I want to talk to Canberk",
];

/** What the actor sees while a tool runs, instead of a bare ellipsis. */
const DOING: Record<string, string> = {
  search_monologues: "Looking through the library",
  check_title: "Checking the library",
  my_account: "Checking your account",
  pricing: "Checking the plans",
  save_monologue: "Saving it",
  hand_off: "Passing this to Canberk",
};

/**
 * Cue: the headset in the corner and the sheet it opens.
 *
 * On a phone the button rides above the tab bar the way the upload banner
 * does, and the open sheet covers the bar. On desktop hovering the button
 * slides out its name and lights the cue light.
 */
export function Cue() {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [thread, setThread] = useState<CueThread | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [doing, setDoing] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open || thread) return;
    api
      .get<CueThread>("/api/cue/thread")
      .then(({ data: t }) => {
        setThread(t);
        setMsgs(t.messages);
        setCapped(t.capped);
      })
      .catch(() => setThread({ messages: [], is_plus: false, used: 0, limit: null, capped: false }));
  }, [open, thread]);

  useEffect(() => {
    // Not on touch: focusing pops the keyboard over the starters.
    if (open && window.matchMedia("(hover: hover)").matches) setTimeout(() => input.current?.focus(), 250);
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [msgs, capped, doing, reduce]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // The textarea grows with what's typed, up to a few lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? draft).trim();
      if (!text || busy || capped) return;
      setDraft("");
      setBusy(true);
      setDoing(null);
      setMsgs((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
      const append = (chunk: string) =>
        setMsgs((m) => {
          const next = m.slice();
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      try {
        await sendToCue(text, (e) => {
          if (e.type === "text") {
            setDoing(null);
            append(e.text);
          }
          if (e.type === "tool") setDoing(DOING[e.name] ?? null);
          if (e.type === "capped") {
            // Refused before it was stored, so the question goes back in the box.
            setMsgs((m) => m.slice(0, -2));
            setDraft(text);
            setCapped(true);
          }
          if (e.type === "done") setThread((t) => (t ? { ...t, used: t.used + 1 } : t));
        });
      } catch {
        append("I couldn't reach the server just now. Try again in a moment.");
      } finally {
        setBusy(false);
        setDoing(null);
      }
    },
    [draft, busy, capped],
  );

  const left = thread?.limit != null ? Math.max(0, thread.limit - thread.used) : null;
  const fresh = thread != null && msgs.length === 0 && !capped;

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            key="cue-button"
            type="button"
            onClick={() => setOpen(true)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
            aria-label="Ask Cue"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: 8 }}
            className="fixed right-4 z-[9997] flex h-14 items-center rounded-full border border-border bg-background pl-[11px] pr-[11px] text-foreground shadow-md transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lg bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6 md:right-6"
          >
            <CueMark size={32} live={hover} />
            {/* The name slides out on hover. Touch screens never hover, so a
                phone keeps the round button. */}
            <span
              className={`overflow-hidden whitespace-nowrap text-sm font-medium transition-[max-width,margin,opacity] duration-200 ${
                hover ? "ml-2 mr-1 max-w-[6rem] opacity-100" : "ml-0 max-w-0 opacity-0"
              }`}
            >
              Ask Cue
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            {/* Phones only: dims the page and closes on tap, so the sheet
                reads as on top rather than wedged in. */}
            <motion.div
              key="cue-scrim"
              aria-hidden
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10049] bg-black/30 md:hidden"
            />
            <motion.section
              key="cue-sheet"
              role="dialog"
              aria-label="Cue"
              initial={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
              transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
              className={`theatre-tokens ${theatreFontVars} fixed inset-x-0 bottom-0 z-[10050] flex h-[82dvh] flex-col border-t border-border bg-background text-foreground shadow-md md:inset-x-auto md:bottom-6 md:right-6 md:h-[min(640px,82vh)] md:w-[400px] md:border`}
            >
              <header className="flex items-center gap-3 border-b border-border px-4 py-3">
                <span className="text-foreground">
                  <CueMark size={30} live={busy} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xl leading-none" style={{ fontFamily: "var(--t-display)" }}>
                    Cue
                  </p>
                  <p className="mt-1 text-xs italic text-muted-foreground" style={{ fontFamily: "var(--t-direction)" }}>
                    {busy ? "on it" : "standing by"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close Cue"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <IconX size={18} />
                </button>
              </header>

              <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
                {fresh && (
                  <div className="space-y-4">
                    <p className="text-sm leading-relaxed">{HELLO}</p>
                    <div className="flex flex-wrap gap-2">
                      {STARTERS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => void send(s)}
                          className="rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {msgs.map((m, i) =>
                  m.role === "user" ? (
                    <p
                      key={i}
                      className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap bg-muted px-3 py-2 text-sm leading-relaxed"
                    >
                      {m.content}
                    </p>
                  ) : m.content ? (
                    <p key={i} className="max-w-[92%] whitespace-pre-wrap text-sm leading-relaxed">
                      {linkify(m.content).map((s, j) =>
                        s.kind === "link" ? (
                          <Link
                            key={j}
                            href={s.value}
                            onClick={() => window.innerWidth < 768 && setOpen(false)}
                            className="text-primary underline underline-offset-2"
                          >
                            {s.value}
                          </Link>
                        ) : (
                          <span key={j}>{s.value}</span>
                        ),
                      )}
                    </p>
                  ) : (
                    <Working key={i} label={doing} />
                  ),
                )}
                {capped && <CueWall />}
              </div>

              {!capped && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                  className="border-t border-border px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:pb-3"
                >
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={input}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      rows={1}
                      maxLength={2000}
                      placeholder="Ask Cue anything about ActorRise"
                      aria-label="Message Cue"
                      className="min-h-[40px] flex-1 resize-none border border-border bg-background px-3 py-2 text-base outline-none transition-colors focus:border-primary md:text-sm"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || busy}
                      aria-label="Send"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                    >
                      <IconArrowUp size={18} />
                    </button>
                  </div>
                  {left != null && left <= 3 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {left === 0 ? "Last one this month." : `${left} left this month.`}
                    </p>
                  )}
                </form>
              )}
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/** Three dots, and what Cue is doing when it's doing something. */
function Working({ label }: { label: string | null }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      {label && <span>{label}</span>}
    </p>
  );
}

/** The free allowance is spent. Same wall, same words, as the free reads. */
function CueWall() {
  const { subscription } = useSubscription();
  const tier = subscription?.tier_name ?? "free";
  const words = useTrialWords();

  useEffect(() => {
    trackUpgradeModalViewed({ feature: "cue", tier_current: tier });
  }, [tier]);

  return (
    <div className="t-wall border-t border-border pt-2">
      <p className="t-wall__title" style={{ fontSize: 24 }}>
        That&rsquo;s your Cue for the month.
      </p>
      <p className="t-wall__body">
        Plus gets far more of me, and every piece in the library start to finish. Canberk still reads
        everything at canberk@actorrise.com.
      </p>
      <div className="t-wall__foot">
        <Link
          href={plusHref("cue", words.tasted)}
          className="t-wall__cta"
          onClick={() => trackPaywallCtaClicked("cue", "wall", tier)}
        >
          {words.cta}
        </Link>
        <Link href="/pricing" className="t-wall__quiet">
          what else is in it
        </Link>
      </div>
      <p className="t-wall__body" style={{ marginTop: 12, fontSize: 12 }}>
        {words.terms}
      </p>
    </div>
  );
}
