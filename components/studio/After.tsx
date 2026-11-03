"use client";

/**
 * After: how it went and what you'd change. A form (what it was, how it felt,
 * what worked, what you'd change) and the notes so far, newest first. The
 * last "what I'd change" is what the next Places and prep open with.
 */

import { useState } from "react";
import { trackEvent } from "@/lib/events";
import { FEELS, KINDS, type Take, type TakeFeel, type TakeKind } from "@/lib/studio/after";
import { newId, type Role } from "@/lib/studio/notebook";
import { display, toggle } from "./style";

const quiet = { fontSize: 12.5, color: "#a1a1a1", opacity: 0.62, lineHeight: 1.5 } as const;

const chip = toggle;

export function when(at: number, now = Date.now()): string {
  const mins = Math.round((now - at) / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 20) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days <= 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function AfterForm({
  onSave,
  onCancel,
  autoFocus = false,
}: {
  onSave: (t: Take) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [kind, setKind] = useState<TakeKind>("audition");
  const [feel, setFeel] = useState<TakeFeel | null>(null);
  const [worked, setWorked] = useState("");
  const [change, setChange] = useState("");
  const empty = !worked.trim() && !change.trim() && !feel;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (empty) return;
        trackEvent("studio_after_saved", {
          kind,
          feel: feel ?? "none",
          worked: worked.trim().length,
          change: change.trim().length,
        });
        onSave({ id: newId(), at: Date.now(), kind, feel, worked: worked.trim(), change: change.trim() });
      }}
      style={{ display: "grid", gap: 12 }}
    >
      <div>
        <div className="text-[#a1a1a1]" style={{ fontSize: 10, opacity: 0.55, marginBottom: 6 }}>
          What was it
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} style={chip(kind === k.id)}>
              {k.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[#a1a1a1]" style={{ fontSize: 10, opacity: 0.55, marginBottom: 6 }}>
          How did it feel
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FEELS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={feel === f.id}
              onClick={() => setFeel(feel === f.id ? null : f.id)}
              style={chip(feel === f.id)}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ ...display, fontSize: 17 }}>What worked?</span>
        <textarea
          className="studio-field"
          value={worked}
          onChange={(e) => setWorked(e.target.value)}
          placeholder="The moment it was really happening…"
          rows={2}
          autoFocus={autoFocus}
        />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ ...display, fontSize: 17 }}>What would you change?</span>
        <textarea
          className="studio-field"
          value={change}
          onChange={(e) => setChange(e.target.value)}
          placeholder="Next time I'll…"
          rows={2}
        />
        <span style={{ ...quiet, fontSize: 11.5 }}>Your next Places and prep open with this.</span>
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ ...chip(false) }}>
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={empty}
          style={{
            fontSize: 12,
                        borderRadius: 6,
            border: "1px solid #ededed",
            background: "#ededed",
            color: "#000000",
            cursor: empty ? "default" : "pointer",
            opacity: empty ? 0.45 : 1,
          }}
        >
          Keep it
        </button>
      </div>
    </form>
  );
}

export function AfterTab({
  role,
  onEdit,
  writing,
  onWriting,
}: {
  role: Role;
  onEdit: (fn: (r: Role) => Role) => void;
  writing: boolean;
  onWriting: (v: boolean) => void;
}) {
  const takes = role.takes ?? [];
  const save = (t: Take) => {
    onEdit((r) => ({ ...r, takes: [t, ...(r.takes ?? [])] }));
    onWriting(false);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>

      {writing ? (
        <AfterForm onSave={save} onCancel={() => onWriting(false)} autoFocus />
      ) : (
        <button
          type="button"
          onClick={() => onWriting(true)}
          style={{
            textAlign: "left",
            padding: "12px 14px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.16)",
            border: "1px solid rgba(255,255,255,0.6)",
            color: "#ededed",
            cursor: "pointer",
          }}
        >
          <span style={{ ...display, fontSize: 18 }}>How did it go?</span>
        </button>
      )}

      <ol style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
        {takes.map((t) => (
          <li key={t.id} style={{ border: "1px solid rgba(255,255,255,0.1)", padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <span className="text-[#a1a1a1]" style={{ fontSize: 10.5, opacity: 0.7 }}>
                {KINDS.find((k) => k.id === t.kind)?.name}
                {t.feel ? ` · ${FEELS.find((f) => f.id === t.feel)?.name}` : ""}
              </span>
              <span style={{ fontSize: 11, opacity: 0.45, color: "#a1a1a1" }}>{when(t.at)}</span>
            </div>
            {t.worked && (
              <p style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 6, color: "#ededed" }}>
                <span style={{ opacity: 0.55 }}>Worked: </span>
                {t.worked}
              </p>
            )}
            {t.change && (
              <p style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 4, color: "#ededed" }}>
                <span style={{ opacity: 0.7 }}>Change: </span>
                {t.change}
              </p>
            )}
            <button
              type="button"
              onClick={() => onEdit((r) => ({ ...r, takes: (r.takes ?? []).filter((x) => x.id !== t.id) }))}
              style={{ marginTop: 6, fontSize: 11, opacity: 0.45, color: "#a1a1a1", background: "none", border: 0, padding: 0, cursor: "pointer" }}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
