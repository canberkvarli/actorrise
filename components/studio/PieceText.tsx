"use client";

/**
 * The piece a role works on: choose it from the library, then read it line by
 * line and pin moments to lines.
 *
 * The text is fetched from the library each time, through the normal read
 * route, so the read wall holds (a free actor past their reads gets the
 * opening only, with Plus as the next step) and no monologue text is ever
 * copied into the notebook. Re-opening a piece already read is free.
 */

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import type { Moment, Piece } from "@/lib/studio/notebook";
import { splitLines } from "@/lib/studio/text";
import { display, EASE, mono } from "./style";

type Hit = { id: number; title: string; character_name: string; play_title: string; author: string };
type Full = Hit & { text: string; paywalled?: boolean };

const quiet = { fontSize: 12.5, color: "#e9d6c4", opacity: 0.62, lineHeight: 1.5 } as const;

export function PieceChooser({
  signedIn,
  onChoose,
  onCancel,
}: {
  signedIn: boolean;
  onChoose: (p: Piece) => void;
  onCancel?: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [state, setState] = useState<"idle" | "searching" | "empty" | "error">("idle");

  useEffect(() => {
    const term = q.trim();
    if (!signedIn || term.length < 2) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setState("searching");
      try {
        const { data } = await api.get<{ results: Hit[] }>(
          `/api/monologues/search?q=${encodeURIComponent(term)}&limit=8`,
          { timeoutMs: 20000 },
        );
        if (cancelled) return;
        setHits(data.results ?? []);
        setState(data.results?.length ? "idle" : "empty");
      } catch {
        if (!cancelled) setState("error");
      }
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, signedIn]);

  if (!signedIn)
    return (
      <p style={quiet}>
        <a
          href="/login?redirect=/studio"
          style={{ color: "#ffd2a6", textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          Sign in
        </a>{" "}
        to bring a monologue from the library into this role.
      </p>
    );

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        className="studio-field"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the library: a play, a character, a feeling"
        aria-label="Search the library"
        autoFocus
      />
      {state === "searching" && <p style={quiet}>Looking…</p>}
      {state === "empty" && <p style={quiet}>Nothing for that yet. Try the play or the character&apos;s name.</p>}
      {state === "error" && <p style={quiet}>The library didn&apos;t answer. Try again in a moment.</p>}
      {q.trim().length >= 2 &&
        hits.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() =>
              onChoose({
                id: h.id,
                title: h.title,
                character: h.character_name,
                play: h.play_title,
                author: h.author,
              })
            }
            style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(243,217,191,0.03)",
              border: "1px solid rgba(243,217,191,0.1)",
              color: "#f3e6da",
              cursor: "pointer",
            }}
          >
            <span style={{ ...display, fontSize: 16, display: "block" }}>{h.character_name}</span>
            <span style={{ fontSize: 12, opacity: 0.6 }}>
              {h.play_title}
              {h.author ? `, ${h.author}` : ""}
            </span>
          </button>
        ))}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          style={{ ...quiet, justifySelf: "start", background: "none", border: 0, padding: 0, cursor: "pointer" }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

export type PieceState = { full: Full | null; lines: string[]; failed: boolean };

/** One read of the role's piece, shared by the Text tab and Places. */
export function usePiece(id: number | null | undefined): PieceState {
  const [got, setGot] = useState<{ id: number; full: Full | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .get<Full>(`/api/monologues/${id}`, { timeoutMs: 20000 })
      .then(({ data }) => !cancelled && setGot({ id, full: data, failed: false }))
      .catch(() => !cancelled && setGot({ id, full: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const current = got && got.id === id ? got : null;
  const full = current?.full ?? null;
  const lines = useMemo(() => (full?.text ? splitLines(full.text) : []), [full]);
  return { full, lines, failed: !!current?.failed };
}

export function PieceText({
  state,
  moments,
  line,
  onLine,
  onGoTo,
  activeMoment,
  fine,
}: {
  state: PieceState;
  moments: Moment[];
  line: number | null;
  onLine: (i: number | null) => void;
  onGoTo: (id: string) => void;
  activeMoment: string | null;
  fine: boolean;
}) {
  const { full, lines, failed } = state;
  const onLineOf = (i: number) => moments.map((m, n) => ({ m, n })).filter(({ m }) => m.line === i);

  if (failed) return <p style={quiet}>Couldn&apos;t open the piece. Check you&apos;re signed in and try again.</p>;
  if (!full) return <p style={quiet}>Opening the piece…</p>;

  return (
    <div style={{ display: "grid", gap: 2 }}>
      <p style={{ ...quiet, marginBottom: 8 }}>
        Tap a line, move the light to where you are on it, then pin.{fine ? " P pins." : ""}
      </p>
      {lines.map((text, i) => {
        const on = line === i;
        const here = onLineOf(i);
        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "26px 1fr",
              gap: 8,
              alignItems: "start",
              padding: "6px 8px",
              borderRadius: 10,
              background: on ? "rgba(203,75,0,0.12)" : "transparent",
              transition: `background 200ms ${EASE}`,
            }}
          >
            <span style={{ ...mono, fontSize: 10, opacity: 0.35, paddingTop: 4, textAlign: "right" }}>{i + 1}</span>
            <div>
              <button
                type="button"
                onClick={() => onLine(on ? null : i)}
                aria-pressed={on}
                className="font-typewriter"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: on ? "#fff1e4" : "#ead8c6",
                  background: "none",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  userSelect: "text",
                }}
              >
                {text}
              </button>
              {here.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {here.map(({ m, n }) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onGoTo(m.id)}
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,178,122,0.5)",
                        background: m.id === activeMoment ? "#CB4B00" : "rgba(203,75,0,0.14)",
                        color: "#fff1e4",
                        cursor: "pointer",
                      }}
                    >
                      <span style={mono}>{n + 1}</span> {m.label || "Moment"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {full.paywalled && (
        <div style={{ marginTop: 12, padding: "12px 14px", border: "1px solid rgba(203,75,0,0.5)" }}>
          <p style={{ fontSize: 13, color: "#f3e6da", lineHeight: 1.5 }}>
            That&apos;s the opening. Your free reads this month are used, and Plus opens the whole piece.
          </p>
          <a
            href="/pricing"
            className="uppercase tracking-[0.14em]"
            style={{
              display: "inline-block",
              marginTop: 10,
              fontSize: 10.5,
              padding: "7px 12px",
              borderRadius: 999,
              background: "#CB4B00",
              color: "#fff6ee",
            }}
          >
            See Plus
          </a>
        </div>
      )}
    </div>
  );
}
