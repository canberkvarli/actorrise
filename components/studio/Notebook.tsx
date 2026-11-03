"use client";

/**
 * The role's notebook: the questions you ask of a part, and the moments you
 * pin in the cube. A drawer on the left on a wide screen, a sheet from the
 * bottom on a phone. It only edits data; EffortCube owns it and saves it.
 */

import { useEffect, useRef, useState } from "react";
import { read, type EffortPoint } from "@/lib/studio/effort";
import { answered, arcRange, type Moment, type Notebook as NotebookData, type Role } from "@/lib/studio/notebook";
import { GROUPS, QUESTIONS, type Question } from "@/lib/studio/questions";
import { PieceChooser, PieceText } from "./PieceText";
import { display, EASE, mono } from "./style";
import type { SyncStatus } from "./useStudioSync";

export type Tab = "text" | "questions" | "moments";

type Props = {
  open: boolean;
  wide: boolean;
  width: number;
  nb: NotebookData;
  role: Role;
  tab: Tab;
  onTab: (t: Tab) => void;
  signedIn: boolean;
  line: number | null;
  onLine: (i: number | null) => void;
  onClose: () => void;
  onLeave: () => void;
  onEdit: (fn: (r: Role) => Role) => void;
  onSwitch: (id: string) => void;
  onNewRole: () => void;
  onDeleteRole: () => void;
  point: EffortPoint;
  activeMoment: string | null;
  onPin: () => void;
  onGoTo: (id: string) => void;
  playing: boolean;
  onPlay: () => void;
  fine: boolean;
  sync: SyncStatus;
};

const chip = (on = false) =>
  ({
    fontSize: 10.5,
    padding: "6px 11px",
    borderRadius: 999,
    border: `1px solid ${on ? "#CB4B00" : "rgba(243,217,191,0.18)"}`,
    background: on ? "rgba(203,75,0,0.22)" : "transparent",
    color: on ? "#ffd2a6" : "#e9d6c4",
    cursor: "pointer",
    flex: "none",
    transition: `background 250ms ${EASE}, border-color 250ms ${EASE}, color 250ms`,
  }) as const;

const quiet = { fontSize: 12.5, color: "#e9d6c4", opacity: 0.62, lineHeight: 1.5 } as const;

export default function Notebook(props: Props) {
  const { open, wide, width, role, tab, onTab, onClose, onLeave, onEdit, fine } = props;
  const done = answered(role);

  const frame = wide
    ? {
        top: 12,
        bottom: 12,
        left: 12,
        width,
        borderRadius: 20,
        transform: open ? "none" : `translateX(calc(-100% - 24px))`,
      }
    : {
        left: 0,
        right: 0,
        bottom: 0,
        height: "86dvh",
        borderRadius: "20px 20px 0 0",
        transform: open ? "none" : "translateY(100%)",
      };

  return (
    <aside
      aria-label="Notebook"
      aria-hidden={!open}
      style={{
        position: "absolute",
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        background: "rgba(22, 13, 10, 0.86)",
        border: "1px solid rgba(243, 217, 191, 0.12)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        pointerEvents: open ? "auto" : "none",
        opacity: open ? 1 : 0,
        transition: `transform 480ms ${EASE}, opacity 300ms ${EASE}`,
        userSelect: "text",
        ...frame,
      }}
    >
      {/* Head: the role. */}
      <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid rgba(243,217,191,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={onLeave}
            className="uppercase tracking-[0.22em] text-[#e9d6c4] hover:text-white"
            style={{ fontSize: 10.5, opacity: 0.6, background: "none", border: 0, cursor: "pointer", padding: 0 }}
          >
            ← ActorRise
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <RoleSwitcher {...props} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the notebook (N)"
              style={{
                ...mono,
                fontSize: 11,
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "rgba(243,217,191,0.06)",
                border: "1px solid rgba(243,217,191,0.14)",
                color: "#e9d6c4",
                cursor: "pointer",
              }}
            >
              {wide ? "←" : "↓"}
            </button>
          </div>
        </div>
        <input
          className="studio-bare"
          value={role.name}
          onChange={(e) => onEdit((r) => ({ ...r, name: e.target.value }))}
          placeholder="Name the role"
          aria-label="Role"
          style={{ ...display, fontSize: 28, lineHeight: 1.15, marginTop: 12 }}
        />
        <input
          className="studio-bare"
          value={role.scene}
          onChange={(e) => onEdit((r) => ({ ...r, scene: e.target.value }))}
          placeholder="The play and the scene, e.g. Hamlet, 5.1, the graveyard"
          aria-label="Play and scene"
          style={{ fontSize: 13, marginTop: 4, color: "#e9d6c4" }}
        />
        <SyncLine sync={props.sync} />
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button
            type="button"
            onClick={() => onTab("text")}
            className="uppercase tracking-[0.14em]"
            style={chip(tab === "text")}
          >
            Text
          </button>
          <button
            type="button"
            onClick={() => onTab("questions")}
            className="uppercase tracking-[0.14em]"
            style={chip(tab === "questions")}
          >
            Questions <span style={{ ...mono, opacity: 0.6, letterSpacing: 0 }}>{done}/{QUESTIONS.length}</span>
          </button>
          <button
            type="button"
            onClick={() => onTab("moments")}
            className="uppercase tracking-[0.14em]"
            style={chip(tab === "moments")}
          >
            Moments <span style={{ ...mono, opacity: 0.6, letterSpacing: 0 }}>{role.moments.length}</span>
          </button>
        </div>
      </div>

      {/* Body. */}
      <div className="studio-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 18px 22px" }}>
        {tab === "text" ? <TextTab {...props} /> : tab === "questions" ? <Questions {...props} /> : <Moments {...props} />}
      </div>

      {fine && (
        <div
          style={{
            ...mono,
            fontSize: 10,
            opacity: 0.4,
            padding: "8px 18px 12px",
            borderTop: "1px solid rgba(243,217,191,0.06)",
            color: "#e9d6c4",
          }}
        >
          N close · P pin · esc stop typing
        </div>
      )}
    </aside>
  );
}

const SYNC_TEXT: Record<SyncStatus, string> = {
  local: "On this device only.",
  loading: "Opening your notebook…",
  saving: "Saving…",
  saved: "Saved to your account.",
  offline: "Couldn't reach your account. Saved here, will try again.",
};

function SyncLine({ sync }: { sync: SyncStatus }) {
  return (
    <div
      aria-live="polite"
      style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 11.5, color: "#e9d6c4" }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: sync === "saved" ? "#7fbf8a" : sync === "offline" ? "#d9a441" : "rgba(233,214,196,0.45)",
          transition: "background 300ms",
        }}
      />
      <span style={{ opacity: 0.65 }}>{SYNC_TEXT[sync]}</span>
      {sync === "local" && (
        <a
          href="/login?redirect=/studio"
          style={{ color: "#ffd2a6", textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          Sign in to keep it everywhere
        </a>
      )}
    </div>
  );
}

function TextTab(props: Props) {
  const { role, onEdit, signedIn } = props;
  const [choosing, setChoosing] = useState(false);
  const piece = role.piece;

  if (!piece || choosing)
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <p style={quiet}>
          Bring in the piece you&apos;re working on. You&apos;ll read it here line by line and pin moments to the
          lines.
        </p>
        <PieceChooser
          signedIn={signedIn}
          onCancel={piece ? () => setChoosing(false) : undefined}
          onChoose={(p) => {
            onEdit((r) => ({
              ...r,
              piece: p,
              name: r.name || p.character,
              scene: r.scene || p.play,
              // Lines belong to the old piece; the moments stay, unpinned from lines.
              moments: r.piece && r.piece.id !== p.id ? r.moments.map((m) => ({ ...m, line: undefined })) : r.moments,
            }));
            setChoosing(false);
          }}
        />
      </div>
    );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...display, fontSize: 17 }}>{piece.character}</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            {piece.play}
            {piece.author ? `, ${piece.author}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="uppercase tracking-[0.12em]"
          style={chip()}
        >
          Change
        </button>
      </div>
      <PieceText
        piece={piece}
        moments={role.moments}
        line={props.line}
        onLine={props.onLine}
        onGoTo={props.onGoTo}
        activeMoment={props.activeMoment}
        fine={props.fine}
      />
    </div>
  );
}

function RoleSwitcher({ nb, role, onSwitch, onNewRole, onDeleteRole }: Props) {
  return (
    <select
      value={role.id}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__new") onNewRole();
        else if (v === "__delete") {
          if (window.confirm(`Delete ${role.name || "this role"} and its notes?`)) onDeleteRole();
        } else onSwitch(v);
      }}
      aria-label="Switch role"
      style={{
        maxWidth: 150,
        fontSize: 12,
        padding: "5px 8px",
        borderRadius: 8,
        background: "rgba(243,217,191,0.06)",
        border: "1px solid rgba(243,217,191,0.14)",
        color: "#e9d6c4",
        cursor: "pointer",
      }}
    >
      {nb.roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name || "Untitled role"}
        </option>
      ))}
      <option value="__new">+ New role</option>
      <option value="__delete">Delete this role…</option>
    </select>
  );
}

/* ---------------- Questions ---------------- */

function Questions(props: Props) {
  const { role, onEdit, onTab } = props;
  const [openId, setOpenId] = useState<string | null>(() => QUESTIONS.find((q) => !role.answers[q.id])?.id ?? null);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <p style={quiet}>
        Answer in the first person, as them. Short is fine. There are no right answers here, only choices you can
        play.
      </p>
      {GROUPS.map((g) => (
        <div key={g}>
          <div className="uppercase tracking-[0.24em] text-[#CB4B00]" style={{ fontSize: 10, marginBottom: 8 }}>
            {g}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {QUESTIONS.filter((q) => q.group === g).map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                open={openId === q.id}
                onToggle={() => setOpenId(openId === q.id ? null : q.id)}
                value={role.answers[q.id] ?? ""}
                onChange={(v) => onEdit((r) => ({ ...r, answers: { ...r.answers, [q.id]: v } }))}
                onToCube={() => onTab("moments")}
                moments={role.moments.length}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuestionCard({
  q,
  open,
  onToggle,
  value,
  onChange,
  onToCube,
  moments,
}: {
  q: Question;
  open: boolean;
  onToggle: () => void;
  value: string;
  onChange: (v: string) => void;
  onToCube: () => void;
  moments: number;
}) {
  const [nudge, setNudge] = useState(-1);
  const hasAnswer = q.inCube ? moments > 0 : !!value.trim();
  const area = useRef<HTMLTextAreaElement>(null);

  // Grow with the writing.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(76, el.scrollHeight)}px`;
  }, [value, open]);

  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${open ? "rgba(203,75,0,0.45)" : "rgba(243,217,191,0.09)"}`,
        background: open ? "rgba(203,75,0,0.06)" : "rgba(243,217,191,0.025)",
        transition: `border-color 250ms ${EASE}, background 250ms ${EASE}`,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 13px",
          background: "none",
          border: 0,
          color: "#f3e6da",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            flex: "none",
            background: hasAnswer ? "#CB4B00" : "transparent",
            border: `1px solid ${hasAnswer ? "#CB4B00" : "rgba(243,217,191,0.35)"}`,
          }}
        />
        <span style={{ ...display, fontSize: 18, lineHeight: 1.2, flex: 1 }}>{q.ask}</span>
        <span style={{ fontSize: 10.5, opacity: 0.4, flex: "none" }}>{q.from}</span>
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: `grid-template-rows 380ms ${EASE}`,
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div style={{ padding: "0 13px 13px 30px", display: "grid", gap: 10 }}>
            <p style={quiet}>{q.why}</p>
            {nudge >= 0 && (
              <p
                key={nudge}
                style={{
                  fontSize: 13.5,
                  color: "#ffd2a6",
                  lineHeight: 1.45,
                  animation: `studio-in 380ms ${EASE}`,
                }}
              >
                {q.nudges[nudge]}
              </p>
            )}
            {q.inCube ? (
              <button
                type="button"
                onClick={onToCube}
                className="uppercase tracking-[0.14em]"
                style={{ ...chip(true), justifySelf: "start" }}
              >
                {moments ? `See your ${moments} moment${moments === 1 ? "" : "s"}` : "Pin moments in the cube"} →
              </button>
            ) : (
              <textarea
                ref={area}
                className="studio-field"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="I…"
                aria-label={q.ask}
                rows={3}
              />
            )}
            <button
              type="button"
              onClick={() => setNudge((n) => (n + 1) % q.nudges.length)}
              style={{
                justifySelf: "start",
                fontSize: 12,
                color: "#e9d6c4",
                opacity: 0.7,
                background: "none",
                border: 0,
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                textDecorationColor: "rgba(233,214,196,0.3)",
              }}
            >
              {nudge < 0 ? "Ask me something harder" : "Another one"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Moments ---------------- */

function Moments({ role, onEdit, point, activeMoment, onPin, onGoTo, playing, onPlay, fine }: Props) {
  const range = arcRange(role.moments);
  const here = read(point);

  const setMoment = (id: string, fn: (m: Moment) => Moment) =>
    onEdit((r) => ({ ...r, moments: r.moments.map((m) => (m.id === id ? fn(m) : m)) }));
  const shift = (i: number, d: number) =>
    onEdit((r) => {
      const ms = [...r.moments];
      const j = i + d;
      if (j < 0 || j >= ms.length) return r;
      [ms[i], ms[j]] = [ms[j], ms[i]];
      return { ...r, moments: ms };
    });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={quiet}>
        Walk through the scene. At each beat, move the light to where your character is, then pin it. The moments
        join into an arc you can see and play.
      </p>

      <button
        type="button"
        onClick={onPin}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderRadius: 14,
          background: "rgba(203,75,0,0.16)",
          border: "1px solid rgba(203,75,0,0.6)",
          color: "#ffe2c4",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span>
          <span className="uppercase tracking-[0.16em]" style={{ fontSize: 10.5, display: "block", opacity: 0.8 }}>
            Pin where the light is
          </span>
          <span style={{ ...display, fontSize: 17 }}>{here.sentence}</span>
        </span>
        {fine && <span style={{ ...mono, fontSize: 11, opacity: 0.6 }}>P</span>}
      </button>

      {role.moments.length >= 2 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(243,217,191,0.1)",
          }}
        >
          <span style={{ ...quiet, opacity: 0.8 }}>
            {range < 0.22
              ? "Your moments sit close together. Is the character one note here, or is that the choice?"
              : range > 0.6
                ? "A long journey through the cube. Where is the turn?"
                : "The character travels. Play it and watch where it changes."}
          </span>
          <button type="button" onClick={onPlay} className="uppercase tracking-[0.14em]" style={chip(playing)}>
            {playing ? "Stop" : "Play the arc"}
          </button>
        </div>
      )}

      <ol style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
        {role.moments.map((m, i) => {
          const on = m.id === activeMoment;
          return (
            <li
              key={m.id}
              style={{
                borderRadius: 14,
                border: `1px solid ${on ? "rgba(203,75,0,0.6)" : "rgba(243,217,191,0.09)"}`,
                background: on ? "rgba(203,75,0,0.08)" : "rgba(243,217,191,0.025)",
                padding: "10px 12px 12px",
                transition: `border-color 250ms ${EASE}, background 250ms ${EASE}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => onGoTo(m.id)}
                  aria-label={`Go to moment ${i + 1}`}
                  style={{
                    ...mono,
                    flex: "none",
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    fontSize: 11,
                    background: on ? "#CB4B00" : "rgba(243,217,191,0.06)",
                    border: "1px solid rgba(255,178,122,0.5)",
                    color: "#fff1e4",
                    cursor: "pointer",
                  }}
                >
                  {i + 1}
                </button>
                <input
                  className="studio-bare"
                  value={m.label}
                  onChange={(e) => setMoment(m.id, (x) => ({ ...x, label: e.target.value }))}
                  onFocus={() => onGoTo(m.id)}
                  placeholder="Name the beat, e.g. the skull"
                  aria-label={`Moment ${i + 1}`}
                  autoFocus={on && !m.label}
                  style={{ ...display, fontSize: 17 }}
                />
              </div>
              <button
                type="button"
                onClick={() => onGoTo(m.id)}
                style={{
                  marginTop: 4,
                  marginLeft: 34,
                  fontSize: 12,
                  color: "#ffd2a6",
                  opacity: 0.85,
                  background: "none",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {read(m.point).sentence}
                {typeof m.line === "number" && (
                  <span style={{ ...mono, marginLeft: 8, fontSize: 10.5, padding: "1px 5px", border: "1px solid rgba(243,217,191,0.2)", color: "#e9d6c4" }}>
                    line {m.line + 1}
                  </span>
                )}
              </button>
              <textarea
                className="studio-field"
                value={m.note}
                onChange={(e) => setMoment(m.id, (x) => ({ ...x, note: e.target.value }))}
                onFocus={() => onGoTo(m.id)}
                placeholder="What's happening for you here?"
                aria-label={`Note for moment ${i + 1}`}
                rows={2}
                style={{ marginTop: 8, fontSize: 13 }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setMoment(m.id, (x) => ({ ...x, point: { ...point } }))}
                  className="uppercase tracking-[0.12em]"
                  style={chip()}
                  title="Move this pin to where the light is now"
                >
                  Re-pin here
                </button>
                <button
                  type="button"
                  onClick={() => shift(i, -1)}
                  disabled={i === 0}
                  aria-label="Earlier"
                  style={{ ...chip(), opacity: i === 0 ? 0.3 : 1 }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => shift(i, 1)}
                  disabled={i === role.moments.length - 1}
                  aria-label="Later"
                  style={{ ...chip(), opacity: i === role.moments.length - 1 ? 0.3 : 1 }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onEdit((r) => ({ ...r, moments: r.moments.filter((x) => x.id !== m.id) }))}
                  className="uppercase tracking-[0.12em]"
                  style={{ ...chip(), marginLeft: "auto", opacity: 0.6 }}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
