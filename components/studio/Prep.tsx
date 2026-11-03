"use client";

/**
 * Prep: the guided path through a role, about fifteen minutes, with an end.
 *
 *   piece → read it → four questions → the beats (where it turns) → run it.
 *
 * It resumes at the first step not yet done, works on the same role the
 * notebook edits (answers and moments are the same data), and ends in doing
 * the piece: the existing rehearsal, or Places. The other seven questions and
 * the free cube stay in the notebook for deeper work.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/events";
import { ACTIONS, actionPoint, read, type ActionId, type EffortPoint } from "@/lib/studio/effort";
import { AIRS } from "@/lib/studio/air";
import { newId, type Moment, type Role } from "@/lib/studio/notebook";
import { lastChange } from "@/lib/studio/after";
import { CORE, STEPS, resumeAt, type Step } from "@/lib/studio/prep";
import { QUESTIONS, type QuestionId } from "@/lib/studio/questions";
import { PieceChooser, type PieceState } from "./PieceText";
import { action, display, EASE, mono, toggle } from "./style";

const quiet = { fontSize: 13, color: "#a1a1a1", opacity: 0.66, lineHeight: 1.55 } as const;

type Props = {
  wide: boolean;
  width: number;
  role: Role;
  piece: PieceState;
  signedIn: boolean;
  activeMoment: string | null;
  onEdit: (fn: (r: Role) => Role) => void;
  onPoint: (p: EffortPoint) => void;
  onLine: (i: number | null) => void;
  onGoTo: (id: string) => void;
  /** Make a just-added moment the active one (it isn't in the list yet for onGoTo). */
  onActive: (id: string) => void;
  onPlaces: () => void;
  /** Mark the role as worked before leaving for the rehearsal. */
  onRunIt: () => void;
  onClose: () => void;
};

export default function Prep(props: Props) {
  const { wide, width, role, piece, onEdit, onClose } = props;
  const [i, setI] = useState(() => resumeAt(role));
  const step = STEPS[i];
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    trackEvent("studio_prep_step", { step: STEPS[i].kind, index: i });
  }, [i]);

  const go = (n: number) => {
    const to = Math.max(0, Math.min(STEPS.length - 1, n));
    setI(to);
    trackEvent("studio_prep_step", { step: STEPS[to].kind, index: to });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return t.blur();
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const frame = wide
    ? { top: 12, bottom: 12, left: 12, width, borderRadius: 12 }
    : { left: 0, right: 0, bottom: 0, height: "86dvh", borderRadius: "12px 12px 0 0" };

  return (
    <aside
      aria-label="Prep"
      style={{
        position: "absolute",
        zIndex: 6,
        display: "flex",
        flexDirection: "column",
        background: "rgba(15, 15, 16, 0.94)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        animation: `prep-in 480ms ${EASE}`,
        userSelect: "text",
        ...frame,
      }}
    >
      {/* Where you are in it. */}
      <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="text-[#8f8f8f]" style={{ fontSize: 10.5 }}>
            Prep{role.name ? ` · ${role.name}` : ""}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close prep"
            className="text-[#a1a1a1]"
            style={{
              fontSize: 10,
              padding: "5px 9px",
              borderRadius: 6,
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.18)",
              cursor: "pointer",
              opacity: 0.75,
            }}
          >
            Close
          </button>
        </div>
        <div aria-hidden style={{ display: "flex", gap: 4, marginTop: 12 }}>
          {STEPS.map((_, n) => (
            <div
              key={n}
              style={{
                flex: 1,
                height: 2,
                background: n <= i ? "#ededed" : "rgba(255,255,255,0.15)",
                transition: `background 300ms ${EASE}`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="studio-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 18px 12px" }}>
        <div key={i} style={{ animation: `studio-in 420ms ${EASE}` }}>
          {step.kind === "piece" && (
            <PieceStep
              {...props}
              onDone={() => go(1)}
              onSkip={() => go(2)}
            />
          )}
          {step.kind === "read" && <ReadStep piece={piece} />}
          {step.kind === "ask" && <AskStep id={step.id} role={role} onEdit={onEdit} />}
          {step.kind === "beats" && <BeatsStep {...props} />}
          {step.kind === "done" && <DoneStep {...props} />}
        </div>
      </div>

      {step.kind !== "piece" && step.kind !== "done" && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            padding: "12px 18px 16px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <button type="button" onClick={() => go(i - 1)} style={navBtn(false)}>
            Back
          </button>
          <button type="button" onClick={() => go(i + 1)} style={navBtn(true)}>
            {nextLabel(step, role)}
          </button>
        </div>
      )}

      <style>{`@keyframes prep-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }`}</style>
    </aside>
  );
}

function nextLabel(step: Step, role: Role): string {
  if (step.kind === "read") return "I've read it";
  if (step.kind === "ask") return role.answers[step.id]?.trim() ? "Next" : "Skip for now";
  if (step.kind === "beats") return role.moments.length ? "I'm ready" : "Skip the beats";
  return "Next";
}

const navBtn = action;

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ ...display, fontSize: 26, lineHeight: 1.2, fontWeight: 400 }}>{children}</h2>
);

/* ---------- 1. The piece ---------- */

function PieceStep({ role, signedIn, onEdit, onDone, onSkip }: Props & { onDone: () => void; onSkip: () => void }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <H>What are you working on?</H>
      <PieceChooser
        signedIn={signedIn}
        autoFocus
        onChoose={(p) => {
          trackEvent("studio_piece_chosen", { monologue_id: p.id, from: "prep" });
          onEdit((r) => ({ ...r, piece: p, name: r.name || p.character, scene: r.scene || p.play }));
          onDone();
        }}
      />
      <button
        type="button"
        onClick={onSkip}
        style={{ ...quiet, justifySelf: "start", background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
      >
        It isn&apos;t in the library: go on without the text
      </button>
      {role.piece && (
        <p style={quiet}>
          Working on {role.piece.character}, {role.piece.play}.{" "}
          <button type="button" onClick={onDone} style={{ color: "#ededed", background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline" }}>
            Keep it
          </button>
        </p>
      )}
    </div>
  );
}

/* ---------- 2. Read it ---------- */

function ReadStep({ piece }: { piece: PieceState }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <H>Read it once, all the way through.</H>
      <p style={quiet}>Out loud if you can. Don&apos;t decide anything yet. Notice where it catches you.</p>
      {!piece.full && !piece.failed && <p style={quiet}>Opening the piece…</p>}
      {piece.failed && <p style={quiet}>Couldn&apos;t open the piece. You can still go on.</p>}
      {piece.lines.length > 0 && (
        <div className="font-typewriter" style={{ display: "grid", gap: 8, fontSize: 14.5, lineHeight: 1.65, color: "#d4d4d4" }}>
          {piece.lines.map((l, n) => (
            <p key={n}>{l}</p>
          ))}
        </div>
      )}
      {piece.full?.paywalled && (
        <p style={{ ...quiet, opacity: 0.85 }}>
          That&apos;s the opening; your free reads this month are used.{" "}
          <a href="/pricing" style={{ color: "#ededed", textDecoration: "underline" }}>
            Plus opens the whole piece.
          </a>
        </p>
      )}
    </div>
  );
}

/* ---------- 3. Four questions ---------- */

function AskStep({ id, role, onEdit }: { id: QuestionId; role: Role; onEdit: Props["onEdit"] }) {
  const q = QUESTIONS.find((x) => x.id === id)!;
  const value = role.answers[id] ?? "";
  const [nudge, setNudge] = useState(-1);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  }, [value]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="text-[#a1a1a1]" style={{ fontSize: 10, opacity: 0.5 }}>
        {CORE.indexOf(id) + 1} of {CORE.length} · {q.from}
      </div>
      <H>{q.ask}</H>
      <p style={quiet}>{q.why}</p>
      {nudge >= 0 && (
        <p key={nudge} style={{ fontSize: 14, color: "#ededed", lineHeight: 1.5, animation: `studio-in 380ms ${EASE}` }}>
          {q.nudges[nudge]}
        </p>
      )}
      <textarea
        ref={area}
        className="studio-field"
        value={value}
        onChange={(e) => onEdit((r) => ({ ...r, answers: { ...r.answers, [id]: e.target.value } }))}
        onBlur={() => value.trim() && trackEvent("studio_question_answered", { question: id, length: value.trim().length, from: "prep" })}
        placeholder="I…"
        aria-label={q.ask}
        autoFocus
        style={{ fontSize: 15 }}
      />
      <button
        type="button"
        onClick={() => setNudge((n) => (n + 1) % q.nudges.length)}
        style={{ ...quiet, justifySelf: "start", background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
      >
        {nudge < 0 ? "Ask me something harder" : "Another one"}
      </button>
    </div>
  );
}

/* ---------- 4. The beats ---------- */

function BeatsStep({ role, piece, activeMoment, onEdit, onPoint, onLine, onGoTo, onActive }: Props) {
  const lines = piece.lines;
  const [label, setLabel] = useState("");

  const beatOn = (line: number | undefined) =>
    line === undefined ? undefined : role.moments.find((m) => m.line === line);

  const add = (line?: number, text = "") => {
    const id = newId();
    const m: Moment = {
      id,
      label: text,
      note: "",
      point: { weight: 0, space: 0, time: 0 },
      ...(line !== undefined ? { line } : {}),
    };
    onEdit((r) => ({ ...r, moments: [...r.moments, m].sort((a, b) => (a.line ?? 1e9) - (b.line ?? 1e9)) }));
    trackEvent("studio_moment_pinned", { moments: role.moments.length + 1, on_line: line !== undefined, from: "prep" });
    onActive(id);
    onPoint(m.point);
    if (line !== undefined) onLine(line);
  };

  const set = (id: string, fn: (m: Moment) => Moment) =>
    onEdit((r) => ({ ...r, moments: r.moments.map((m) => (m.id === id ? fn(m) : m)) }));

  const remove = (id: string) => onEdit((r) => ({ ...r, moments: r.moments.filter((m) => m.id !== id) }));

  const count = role.moments.length;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <H>Where does it turn?</H>
      <p style={quiet}>{lines.length ? "Tap the lines where something changes." : "Name the moments where something changes."}</p>
      <div className="text-[#a1a1a1]" style={{ fontSize: 10, opacity: 0.55 }}>
        {count} {count === 1 ? "beat" : "beats"}
      </div>

      {lines.length > 0 ? (
        <div style={{ display: "grid", gap: 2 }}>
          {lines.map((text, n) => {
            const m = beatOn(n);
            return (
              <div
                key={n}
                style={{
                  borderRadius: 8,
                  border: `1px solid ${m ? "rgba(255,255,255,0.55)" : "transparent"}`,
                  background: m ? "rgba(255,255,255,0.07)" : "transparent",
                  padding: "6px 8px",
                }}
              >
                <button
                  type="button"
                  onClick={() => (m ? onGoTo(m.id) : add(n))}
                  className="font-typewriter"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: m ? "#ededed" : "#d4d4d4",
                    background: "none",
                    border: 0,
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  {text}
                </button>
                {m && <BeatEditor m={m} on={m.id === activeMoment} set={set} remove={remove} onPoint={onPoint} onGoTo={onGoTo} />}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {role.moments.map((m) => (
            <div key={m.id} style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.45)", padding: "8px 10px" }}>
              <div style={{ ...display, fontSize: 16 }}>{m.label || "A beat"}</div>
              <BeatEditor m={m} on={m.id === activeMoment} set={set} remove={remove} onPoint={onPoint} onGoTo={onGoTo} />
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!label.trim()) return;
              add(undefined, label.trim());
              setLabel("");
            }}
            style={{ display: "flex", gap: 8 }}
          >
            <input
              className="studio-field"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Name the beat, e.g. she sees the letter"
              aria-label="New beat"
            />
            <button type="submit" style={navBtn(true)}>
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function BeatEditor({
  m,
  on,
  set,
  remove,
  onPoint,
  onGoTo,
}: {
  m: Moment;
  on: boolean;
  set: (id: string, fn: (m: Moment) => Moment) => void;
  remove: (id: string) => void;
  onPoint: (p: EffortPoint) => void;
  onGoTo: (id: string) => void;
}) {
  const current = useMemo(() => read(m.point), [m.point]);
  const pick = (id: ActionId) => {
    const p = actionPoint(id);
    set(m.id, (x) => ({ ...x, point: p }));
    onGoTo(m.id);
    onPoint(p);
  };
  const chip = toggle;

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 8, opacity: on ? 1 : 0.85 }}>
      <div style={{ fontSize: 10, opacity: 0.55, color: "#a1a1a1" }} >
        How you move
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            title={a.feel}
            aria-pressed={current.mainShare > 0.8 && current.main.id === a.id}
            onClick={() => pick(a.id)}
            style={chip(current.mainShare > 0.8 && current.main.id === a.id)}
          >
            {a.name}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, opacity: 0.55, color: "#a1a1a1" }} >
        The air
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {AIRS.map((a) => {
          const sel = (m.air ?? "still") === a.id;
          return (
            <button
              key={a.id}
              type="button"
              title={a.feel}
              aria-pressed={sel}
              onClick={() => {
                set(m.id, (x) => ({ ...x, air: a.id }));
                onGoTo(m.id);
              }}
              style={chip(sel)}
            >
              {a.name}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ ...mono, fontSize: 10.5, opacity: 0.5, color: "#a1a1a1" }}>{current.sentence}</span>
        <button
          type="button"
          onClick={() => remove(m.id)}
          style={{ fontSize: 11, opacity: 0.55, color: "#a1a1a1", background: "none", border: 0, cursor: "pointer" }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

/* ---------- 5. Ready ---------- */

function DoneStep(props: Props) {
  const { role, onPlaces, onClose } = props;
  const change = lastChange(role);
  const answers = CORE.filter((id) => role.answers[id]?.trim()).length;
  useEffect(() => {
    trackEvent("studio_prep_done", { answers, beats: role.moments.length, has_piece: !!role.piece });
    // once, on arriving here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <H>You&apos;re ready to work it.</H>
      <p style={quiet}>
        {answers} of {CORE.length} questions answered · {role.moments.length}{" "}
        {role.moments.length === 1 ? "beat" : "beats"}. Now put it in your body.
      </p>
      {change && (
        <div style={{ borderLeft: "2px solid #ededed", padding: "4px 0 4px 12px" }}>
          <div className="text-[#a1a1a1]" style={{ fontSize: 10, opacity: 0.6 }}>
            Last time you said you&apos;d change
          </div>
          <p style={{ ...display, fontSize: 18, lineHeight: 1.35, marginTop: 4 }}>{change}</p>
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {role.piece && (
          <a
            href={`/monologue/${role.piece.id}/work`}
            onClick={() => {
              trackEvent("studio_run_it", { monologue_id: role.piece!.id });
              props.onRunIt();
            }}
            style={{ ...navBtn(true), display: "block", textAlign: "center", fontSize: 13 }}
          >
            Run it
          </a>
        )}
        <button
          type="button"
          onClick={onPlaces}
          style={{ ...navBtn(!role.piece), fontSize: 13 }}
        >
          Places, the minute before you go on
        </button>
        <button type="button" onClick={onClose} style={{ ...navBtn(false) }}>
          Back to the stage
        </button>
      </div>
    </div>
  );
}
