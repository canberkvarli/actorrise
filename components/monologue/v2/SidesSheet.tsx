"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Monologue } from "@/types/actor";
import { displayableAuthor } from "@/lib/utils";
import { estimateDurationSeconds, formatClock } from "@/lib/estimateDuration";
import { applyCut } from "@/lib/monologueSegments";

/**
 * Copy mode: your sides, as a sheet you could hand someone.
 *
 * The export used to be a bordered preview box with two outline buttons over
 * it, which looked like a form. What an actor is making here is a piece of
 * paper, so it looks like one — leaning slightly, on a hard shadow. The slug
 * line a real side carries is on the PRINTED page, not this one: on screen a
 * URL you can't click or select only repeats the Copy link button below it.
 *
 * It exports the CUT, not the whole piece, whenever one is set.
 */
export function SidesSheet({ monologue }: { monologue: Monologue }) {
  const [copied, setCopied] = useState(false);
  const [linked, setLinked] = useState(false);

  const author = displayableAuthor(monologue.author);
  const source = [monologue.play_title, author].filter(Boolean).join(" · ");

  /* Must go through the shared segmenter: the saved indices are positions in
     monologueSegments(), which is sentences for prose and lines only for
     verse. Splitting on "\n" here would slice a different array than the one
     the cut editor counted against. */
  const cutText = useMemo(
    () => applyCut(monologue.text, monologue.cut_start_line, monologue.cut_end_line),
    [monologue],
  );

  const isCut =
    monologue.cut_start_line != null && monologue.cut_end_line != null;

  /* The slug at the foot of a real side: where this page came from, and who
     rendered it into English if anyone did. It belongs on PAPER — on screen
     the URL is an unselectable duplicate of the Copy link button below, so
     only the translator credit shows there. */
  const translatorCredit = monologue.translator
    ? `${monologue.translator} translation`
    : "";
  const slug = [`actorrise.com/monologue/${monologue.id}`, translatorCredit]
    .filter(Boolean)
    .join(" · ");
  const seconds = estimateDurationSeconds(cutText);

  const paras = useMemo(
    () => cutText.trim().split(/\n{2,}/).filter((p) => p.trim()),
    [cutText],
  );

  const plainText = useMemo(() => {
    const header = [monologue.character_name, source ? `from ${source}` : ""]
      .filter(Boolean)
      .join(" ");
    return `${header}\n\n${cutText.trim()}\n`;
  }, [monologue.character_name, source, cutText]);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select and copy manually.");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/monologue/${monologue.id}`,
      );
      setLinked(true);
      toast.success("Link copied");
      setTimeout(() => setLinked(false), 2000);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  function print() {
    const w = window.open("", "_blank", "width=680,height=800");
    if (!w) {
      toast.error("Allow pop-ups to print.");
      return;
    }
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(`<!doctype html><html><head><title>${esc(
      monologue.character_name || "Monologue",
    )}</title><style>
      body{font-family:"Courier Prime",ui-monospace,monospace;margin:1in;color:#111;line-height:1.6;font-size:13pt}
      h1{font-size:15pt;margin:0 0 2pt}
      .src{color:#555;font-size:11pt;margin:0 0 24pt}
      pre{white-space:pre-wrap;font-family:inherit;font-size:13pt;margin:0}
      .slug{color:#777;font-size:9pt;letter-spacing:0.04em;margin:32pt 0 0}
    </style></head><body>
      <h1>${esc(monologue.character_name || "")}</h1>
      <p class="src">${esc(source)}</p>
      <pre>${esc(cutText.trim())}</pre>
      <p class="slug">${esc(slug)}</p>
    </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  const exports: { label: string; sub: string; onClick: () => void; primary?: boolean }[] = [
    { label: "Print", sub: "letter · 13pt", onClick: print, primary: true },
    { label: copied ? "Copied" : "Copy text", sub: "for notes", onClick: copyText },
    { label: linked ? "Copied" : "Copy link", sub: `/monologue/${monologue.id}`, onClick: copyLink },
  ];

  return (
    <div className="t-m-rise">
      <p
        className="t-m__dir m-0 text-[13px]"
        style={{ color: "var(--t-muted-dark-2)" }}
      >
        (your sides. {isCut ? "your cut" : "the full piece"}, {formatClock(seconds)}.)
      </p>

      <div
        className="t-m__hard-lg mt-[18px] max-w-[62ch] -rotate-[0.4deg] border-[1.5px] px-7 py-8 sm:px-9"
        style={{ borderColor: "var(--t-text)", background: "var(--t-paper)" }}
      >
        <p
          className="t-m__mono m-0 text-[11px] uppercase tracking-[0.16em]"
          style={{ color: "var(--t-muted-dark-2)" }}
        >
          {source}
        </p>
        <p className="t-m__mono m-0 mt-1.5 text-[18px] font-bold">
          {monologue.character_name}
        </p>
        <div
          className="t-m__mono mt-[18px] border-t pt-4 text-[14px] leading-[1.85]"
          style={{ borderColor: "var(--t-line-light)", color: "var(--t-text-soft)" }}
        >
          {paras.map((p, i) => (
            <p key={i} className="m-0 mb-4 last:mb-0">
              {p}
            </p>
          ))}
        </div>
        {translatorCredit && (
          <p
            className="t-m__mono m-0 mt-[18px] text-[10px] tracking-[0.06em]"
            style={{ color: "var(--t-faint)" }}
          >
            {translatorCredit}
          </p>
        )}
      </div>

      <div className="mt-[22px] flex flex-wrap gap-2">
        {exports.map((e) => (
          <button
            key={e.label}
            type="button"
            onClick={e.onClick}
            className="inline-flex h-12 items-center gap-2.5 rounded-full border-[1.5px] px-[18px] text-[14px] font-bold transition-transform duration-300 hover:-translate-y-0.5 hover:-rotate-1"
            style={{
              borderColor: "var(--t-text)",
              background: e.primary ? "var(--t-text)" : "transparent",
              color: e.primary ? "var(--t-on-text)" : "var(--t-text)",
            }}
          >
            {e.label}
            <span className="t-m__mono text-[11px] tracking-[0.06em] opacity-70">
              {e.sub}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
