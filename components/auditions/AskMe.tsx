"use client";

import { useState } from "react";
import { toast } from "sonner";

import type { Audition } from "@/lib/auditions";
import { useAskAudition, useForgetAsk } from "@/hooks/useAuditions";
import { SAVE_FAILED } from "./SidesSection";

/** One question box about this audition. Answers come from what's saved on it, and stay until you take them off. */
export function AskMe({ a }: { a: Audition }) {
  const ask = useAskAudition();
  const forget = useForgetAsk();
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
        toast.error(SAVE_FAILED);
      },
    });
  }

  return (
    <section id="aud-ask-me" aria-labelledby="aud-ask-h">
      <div className="aud-sec-head">
        <h2 id="aud-ask-h" className="aud-sec-title text-[26px]">Ask me</h2>
        <span className="aud-cap-muted text-[13px]">about this audition</span>
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
                    aria-label={`Take "${x.q}" off the page`}
                    title="Take it off"
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
                  ? "That's all my questions for this month on your plan."
                  : "I couldn't answer that just now. Try again in a moment.",
              );
            },
          });
        }}
      >
        <label className="sr-only" htmlFor="aud-ask-input">Ask me about this audition</label>
        <input
          id="aud-ask-input"
          className="aud-input min-w-0 flex-1 px-4 py-3 text-[17px]"
          placeholder="where do I park? what should I wear?"
          maxLength={500}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" disabled={ask.isPending || q.trim().length < 2} className="aud-ask-btn aud-focus px-5 text-[15px] font-semibold">
          {ask.isPending ? "Thinking" : "Ask"}
        </button>
      </form>
      {ask.isPending && <p className="aud-pencil-muted aud-thinking mt-2 text-[17px]" role="status">(thinking it over)</p>}
      {error && <p className="aud-cap-muted mt-2 text-[13.5px]" role="alert">{error}</p>}
    </section>
  );
}
