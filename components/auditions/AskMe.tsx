"use client";

import { useState } from "react";
import { toast } from "sonner";

import type { Audition } from "@/lib/auditions";
import { useAskAudition, useForgetAsk } from "@/hooks/useAuditions";
import { useT } from "@/lib/i18n";

/** One question box about this audition. Answers come from what's saved on it, and stay until you take them off. */
export function AskMe({ a }: { a: Audition }) {
  const ask = useAskAudition();
  const forget = useForgetAsk();
  const t = useT();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Leaving rows fold away before the server copy drops them.
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const asks = a.assist.asks;

  function remove(at: string) {
    setLeaving((s) => new Set(s).add(at));
    forget.mutate({ id: a.id, at }, {
      onError: () => {
        setLeaving((s) => {
          const next = new Set(s);
          next.delete(at);
          return next;
        });
        toast.error(t("appAuditionsErr.saveFailed"));
      },
    });
  }

  return (
    <section id="aud-ask-me" aria-labelledby="aud-ask-h">
      <div className="aud-sec-head">
        <h2 id="aud-ask-h" className="aud-sec-title text-[26px]">{t("appAuditionsAsk.title")}</h2>
        <span className="aud-cap-muted text-[13px]">{t("appAuditionsAsk.sub")}</span>
      </div>
      {asks.length > 0 && (
        <ul className="mb-4 grid">
          {asks.map((x) => (
            <li key={x.at} className="aud-fold" data-open={leaving.has(x.at) ? "false" : "true"}>
              <div className="aud-ask-row group py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="aud-ask-q text-[15px] font-semibold">{x.q}</p>
                  <button
                    type="button"
                    className="aud-x aud-focus"
                    aria-label={t("appAuditionsAsk.takeOffLabel", { q: x.q })}
                    title={t("appAuditionsAsk.takeOff")}
                    disabled={leaving.has(x.at)}
                    onClick={() => remove(x.at)}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <p className="mt-1 text-[15.5px] leading-relaxed">{x.a}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = q.trim();
          if (text.length < 2 || ask.isPending) return;
          setError(null);
          ask.mutate({ id: a.id, q: text }, {
            onSuccess: () => setQ(""),
            onError: (err) => {
              const detail = (err as { response?: { status?: number; data?: { detail?: unknown } } }).response;
              setError(
                detail?.status === 403
                  ? t("appAuditionsAsk.quota")
                  : t("appAuditionsAsk.failed"),
              );
            },
          });
        }}
      >
        <label className="sr-only" htmlFor="aud-ask-input">{t("appAuditionsAsk.label")}</label>
        <input
          id="aud-ask-input"
          className="aud-input min-w-0 flex-1 px-4 py-3 text-[17px]"
          placeholder={t("appAuditionsAsk.placeholder")}
          maxLength={500}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" disabled={ask.isPending || q.trim().length < 2} className="aud-ask-btn aud-focus px-5 text-[15px] font-semibold">
          {ask.isPending ? t("appAuditionsAsk.thinking") : t("appAuditionsAsk.ask")}
        </button>
      </form>
      {ask.isPending && <p className="aud-pencil-muted aud-thinking mt-2 text-[17px]" role="status">{t("appAuditionsAsk.thinkingOver")}</p>}
      {error && <p className="aud-cap-muted mt-2 text-[13.5px]" role="alert">{error}</p>}
    </section>
  );
}
