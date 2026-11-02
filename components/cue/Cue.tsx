"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconX } from "@tabler/icons-react";
import { CueMark } from "@/components/cue/CueMark";
import { api } from "@/lib/api";
import { linkify, sendToCue, type CueThread } from "@/lib/cue";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialWords } from "@/hooks/useTrialWords";
import { plusHref } from "@/lib/trial";
import { trackPaywallCtaClicked, trackUpgradeModalViewed } from "@/lib/analytics";
import { useT, useTList } from "@/lib/i18n";
import s from "./cue.module.css";

type Msg = { role: "user" | "assistant"; content: string };

// The hello (appScenesCue.hello) is said once, the first time the window
// opens on an empty day. Cue itself is told not to repeat it. The starters are
// sent as the actor's own message, so they go in the actor's language.

/**
 * Cue: the Q in the corner and the window it opens. Visuals follow the Claude
 * Design spec of 2026-10-28; see cue.module.css for the colours.
 *
 * The launcher stays put while the window is open and turns into its close
 * button. On a phone the window is the whole screen with its own close.
 */
export function Cue() {
  const t = useT();
  const tList = useTList();
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
      .then(({ data }) => {
        setThread(data);
        setMsgs(data.messages);
        setCapped(data.capped);
      })
      .catch(() => setThread({ messages: [], is_plus: false, used: 0, limit: null, capped: false }));
  }, [open, thread]);

  useEffect(() => {
    // Not on touch: focusing pops the keyboard over the suggestions.
    if (open && window.matchMedia("(hover: hover)").matches) setTimeout(() => input.current?.focus(), 250);
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [msgs, capped, reduce]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // The box grows with what's typed, up to a few lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? draft).trim();
      if (!text || busy) return;
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
            // Refused before it was stored, so the question goes back in the box.
            setMsgs((m) => m.slice(0, -2));
            setDraft(text);
            setCapped(true);
          }
          if (e.type === "done") setThread((th) => (th ? { ...th, used: th.used + 1 } : th));
        });
      } catch {
        append(t("appScenesCue.unreachable"));
      } finally {
        setBusy(false);
      }
    },
    [draft, busy, t],
  );

  const left = thread?.limit != null ? Math.max(0, thread.limit - thread.used) : null;
  const fresh = thread != null && msgs.length === 0 && !capped;

  return (
    <div className={`${s.root} theatre-tokens ${theatreFontVars}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? t("appScenesCue.close") : t("appScenesCue.ask")}
        aria-expanded={open}
        data-open={open}
        className={s.launcher}
      >
        {open ? <IconX size={26} stroke={1.75} /> : <CueMark size={36} />}
        <span className={s.tag} aria-hidden>
          {t("appScenesCue.tag")}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.section
            key="cue-window"
            role="dialog"
            aria-label={t("appScenesCue.name")}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.6 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0.15 } : { duration: 0.34, ease: [0.2, 0.9, 0.3, 1.15] }}
            className={s.window}
          >
            <header className={s.band}>
              <span className={s.disc}>
                <CueMark size={30} />
              </span>
              <div className="min-w-0">
                <p className={s.name}>{t("appScenesCue.name")}</p>
                <p className={s.sub}>
                  <span className={s.gel} aria-hidden />
                  {t("appScenesCue.sub")}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("appScenesCue.close")} className={s.close}>
                <IconX size={18} />
              </button>
            </header>

            <div ref={scroller} className={s.log}>
              <p className={s.aside}>{t("appScenesCue.aside")}</p>
              {fresh && (
                <>
                  <p className={`${s.bubble} ${s.theirs}`}>{t("appScenesCue.hello")}</p>
                  <div className={s.chips}>
                    {tList("appScenesCue.starters").map((q) => (
                      <button key={q} type="button" onClick={() => void send(q)} className={s.chip}>
                        {q}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <p key={i} className={`${s.bubble} ${s.mine}`}>
                    {m.content}
                  </p>
                ) : m.content ? (
                  <p key={i} className={`${s.bubble} ${s.theirs}`}>
                    {linkify(m.content).map((seg, j) =>
                      seg.kind === "link" ? (
                        <Link key={j} href={seg.value} onClick={() => window.innerWidth < 768 && setOpen(false)}>
                          {seg.value}
                        </Link>
                      ) : (
                        <span key={j}>{seg.value}</span>
                      ),
                    )}
                  </p>
                ) : (
                  <p key={i} className={`${s.bubble} ${s.theirs} ${s.typing}`} aria-live="polite">
                    {t("appScenesCue.checking")}
                  </p>
                ),
              )}
              {capped && <CueWall />}
            </div>

            {/* Stays under the paywall: a teacher or a billing question still
                reaches Canberk at the cap (THROUGH_THE_CAP in agent.py). */}
            {(
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
                className={s.inputRow}
              >
                <div className={s.inputLine}>
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
                    placeholder={capped ? t("appScenesCue.placeholderCapped") : t("appScenesCue.placeholder")}
                    aria-label={t("appScenesCue.message")}
                    className={s.input}
                  />
                  <button type="submit" disabled={!draft.trim() || busy} className={s.send}>
                    {t("appScenesCue.send")}
                  </button>
                </div>
                {!capped && left != null && left <= 3 && (
                  <p className={s.left}>{left === 0 ? t("appScenesCue.lastOne") : t("appScenesCue.left", { n: left })}</p>
                )}
              </form>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The free allowance is spent. Same wall, same words, as the free reads. */
function CueWall() {
  const t = useT();
  const { subscription } = useSubscription();
  const tier = subscription?.tier_name ?? "free";
  const words = useTrialWords();

  useEffect(() => {
    trackUpgradeModalViewed({ feature: "cue", tier_current: tier });
  }, [tier]);

  return (
    <div className={`t-wall ${s.wall}`}>
      <p className="t-wall__title" style={{ fontSize: 24 }}>
        {t("appScenesCue.wallTitle")}
      </p>
      <p className="t-wall__body">
        {t("appScenesCue.wallBody")}
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
          {t("appScenesCue.whatElse")}
        </Link>
      </div>
      <p className="t-wall__body" style={{ marginTop: 12, fontSize: 12 }}>
        {words.terms}
      </p>
    </div>
  );
}
