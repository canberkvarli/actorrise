"use client";

import { useState } from "react";
import { toast } from "sonner";

import type { Audition, BringItem } from "@/lib/auditions";
import { useUpdateAudition } from "@/hooks/useAuditions";
import { SAVE_FAILED } from "./SidesSection";

/** What to bring, ticked as you pack: the casting email's list, my suggestions, and anything you add. */
export function BringList({ a }: { a: Audition }) {
  const update = useUpdateAudition();
  // Shown at once, saved behind: a tick should never wait on the network.
  const [items, setItems] = useState<BringItem[]>(a.bring_list);
  const [seen, setSeen] = useState(a.bring_list);
  if (seen !== a.bring_list) {
    setSeen(a.bring_list);
    setItems(a.bring_list);
  }
  const [draft, setDraft] = useState("");

  function save(next: BringItem[]) {
    const before = items;
    setItems(next);
    update.mutate({ id: a.id, bring_list: next }, {
      onError: () => {
        setItems(before);
        toast.error(SAVE_FAILED);
      },
    });
  }

  const packed = items.filter((i) => i.done).length;

  return (
    <section id="aud-bring" aria-labelledby="aud-bring-h" className="scroll-mt-24">
      <div className="aud-sec-head">
        <h2 id="aud-bring-h" className="aud-sec-title text-[26px]">Bring</h2>
        {items.length > 0 && (
          <span className="flex items-center gap-2.5 text-[13px]">
            <span className="aud-pack-bar" aria-hidden>
              <span style={{ transform: `scaleX(${packed / items.length})` }} />
            </span>
            <span className={packed === items.length ? "aud-pack-done font-semibold" : "aud-cap-muted"}>
              {packed === items.length ? "all packed" : `${packed} of ${items.length} packed`}
            </span>
          </span>
        )}
      </div>
      {items.length === 0 && <p className="aud-pencil-muted text-[18px]">(nothing on the list yet.)</p>}
      <ul>
        {items.map((item, i) => (
          <li key={item.text} className="aud-tick-row aud-row-in group flex items-start gap-3 py-2.5 text-[15px]" data-on={item.done ? "true" : "false"}>
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="sr-only"
                checked={item.done}
                onChange={() => save(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
              />
              <span className="aud-check mt-0.5" data-on={item.done ? "true" : "false"} aria-hidden />
              <span className="aud-tick-text min-w-0 break-words">
                <span className="aud-marker">{item.text}</span>
                {item.src === "ai" && <span className="aud-pencil-muted text-[15px]"> (my idea)</span>}
              </span>
            </label>
            {item.src !== "email" && (
              <button
                type="button"
                className="aud-cap-muted aud-focus px-1 text-[13px] underline-offset-2 hover:underline"
                aria-label={`Take ${item.text} off the list`}
                onClick={() => save(items.filter((_, j) => j !== i))}
              >
                remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text || items.some((x) => x.text.toLowerCase() === text.toLowerCase())) return setDraft("");
          save([...items, { text, done: false, src: "me" }]);
          setDraft("");
        }}
      >
        <label className="sr-only" htmlFor="aud-bring-add">Add something to bring</label>
        <input
          id="aud-bring-add"
          className="aud-input min-w-0 flex-1 px-4 py-2.5 text-[17px]"
          placeholder="add something to bring"
          maxLength={200}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {draft.trim() && <button type="submit" className="aud-ask-btn aud-row-in aud-focus px-4 text-[15px] font-semibold">Add</button>}
      </form>
    </section>
  );
}
