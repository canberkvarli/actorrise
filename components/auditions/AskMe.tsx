"use client";

import { useState } from "react";

import type { Audition } from "@/lib/auditions";
import { useAskAudition } from "@/hooks/useAuditions";

/** One question box about this audition. Answers come from what's saved on it, and stay. */
export function AskMe({ a }: { a: Audition }) {
  const ask = useAskAudition();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const asks = a.assist.asks;

  return (
    <section id="aud-ask-me" aria-labelledby="aud-ask-h">
      <div className="aud-sec-head">
        <h2 id="aud-ask-h" className="aud-sec-title text-[26px]">Ask me</h2>
        <span className="aud-cap-muted text-[13px]">about this audition</span>
      </div>
      {asks.length > 0 && (
        <ul className="mb-4 grid gap-4">
          {asks.map((x) => (
            <li key={x.at + x.q}>
              <p className="text-[14.5px] font-semibold">{x.q}</p>
              <p className="mt-1 text-[15.5px] leading-relaxed">{x.a}</p>
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
          className="aud-input min-w-0 flex-1 px-3.5 py-2.5 text-[15px]"
          placeholder="where do I park? what should I wear? how long is the read?"
          maxLength={500}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" disabled={ask.isPending || q.trim().length < 2} className="aud-quiet-chip aud-focus px-4 text-[14px] font-semibold disabled:opacity-50">
          {ask.isPending ? "Thinking" : "Ask"}
        </button>
      </form>
      {ask.isPending && <p className="aud-pencil-muted aud-thinking mt-2 text-[17px]" role="status">(thinking it over)</p>}
      {error && <p className="aud-cap-muted mt-2 text-[13.5px]" role="alert">{error}</p>}
    </section>
  );
}
