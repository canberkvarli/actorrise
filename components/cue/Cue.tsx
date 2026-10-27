"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconArrowUp, IconX } from "@tabler/icons-react";
import LampSketch from "@/components/onboarding/LampSketch";
import { api } from "@/lib/api";
import { linkify, sendToCue, type CueThread } from "@/lib/cue";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialWords } from "@/hooks/useTrialWords";
import { plusHref } from "@/lib/trial";
import { trackPaywallCtaClicked, trackUpgradeModalViewed } from "@/lib/analytics";

type Msg = { role: "user" | "assistant"; content: string };

const HELLO =
  "I'm Cue, Canberk's assistant. He reads everything, and I cover while he's away. Ask me for a piece, how ScenePartner works, or anything about your account.";

/**
 * Cue: the lamp in the corner and the sheet it opens.
 *
 * The button is the LampSketch fixture, not a chat bubble: one lamp across the
 * app (see one-fixture memory). On a phone it rides above the tab bar the same
 * way the upload banner does; the open sheet covers the bar.
 */
export function Cue() {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<CueThread | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
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
    if (open) setTimeout(() => input.current?.focus(), 250);
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs, capped]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy || capped) return;
    setDraft("");
    setBusy(true);
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
        if (e.type === "text") append(e.text);
        if (e.type === "capped") {
          // The server refused it before storing it, so the question goes too.
          setMsgs((m) => m.slice(0, -2));
          setDraft(text);
          setCapped(true);
        }
        if (e.type === "done") {
          setThread((t) => (t ? { ...t, used: t.used + 1 } : t));
        }
      });
    } catch {
      append("I couldn't reach the server just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [draft, busy, capped]);

  const left = thread?.limit != null ? Math.max(0, thread.limit - thread.used) : null;

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            key="cue-button"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ask Cue, Canberk's assistant"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: 8 }}
            className="fixed right-4 z-[9997] flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md transition-shadow hover:shadow-lg bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6 md:right-6 [--lamp-acc:var(--primary)]"
          >
            <LampSketch size={34} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section
            key="cue-sheet"
            role="dialog"
            aria-label="Cue"
            initial={reduce ? { opacity: 0 } : { y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: "100%", opacity: 0.6 }}
            transition={{ type: "tween", duration: 0.24, ease: "easeOut" }}
            className={`theatre-tokens ${theatreFontVars} fixed inset-x-0 bottom-0 z-[10050] flex h-[78dvh] flex-col border-t border-border bg-background text-foreground shadow-md md:inset-x-auto md:bottom-6 md:right-6 md:h-[min(620px,80vh)] md:w-[400px] md:border`}
          >
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="text-foreground [--lamp-acc:var(--primary)]">
                <LampSketch size={28} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg leading-none" style={{ fontFamily: "var(--t-display)" }}>
                  Cue
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Canberk&rsquo;s assistant</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close Cue"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <IconX size={18} />
              </button>
            </header>

            <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
              <p className="text-sm leading-relaxed text-muted-foreground">{HELLO}</p>
              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <p
                    key={i}
                    className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap border border-border bg-muted px-3 py-2 text-sm leading-relaxed"
                  >
                    {m.content}
                  </p>
                ) : (
                  <p key={i} className="max-w-[92%] whitespace-pre-wrap text-sm leading-relaxed">
                    {m.content ? (
                      linkify(m.content).map((s, j) =>
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
                      )
                    ) : (
                      <span className="inline-block animate-pulse text-muted-foreground">&hellip;</span>
                    )}
                  </p>
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
                    placeholder="Ask Cue"
                    aria-label="Message Cue"
                    className="max-h-32 min-h-[40px] flex-1 resize-none border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary md:text-sm"
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
        )}
      </AnimatePresence>
    </>
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
