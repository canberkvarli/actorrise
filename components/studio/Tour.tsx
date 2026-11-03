"use client";

/**
 * What the Studio is, in four cards: the cube, Prep, Gesture, Places. Shown
 * once on a first visit; the ? at the top brings it back.
 */

import { useEffect, useState } from "react";
import { display, EASE } from "./style";

const KEY = "studio_tour_v1";

const CARDS = [
  {
    title: "The cube is how your character moves.",
    body: "Eight ways a body can move sit on its corners. Drag the light, or tap a corner. The hotter it glows, the stronger and more sudden.",
  },
  {
    title: "Prep: fifteen minutes on a role.",
    body: "Your piece, four questions, and the lines where it turns. Then run it.",
  },
  {
    title: "Gesture: what they want, as one movement.",
    body: "Do it full out with the figure, or into your camera. Then take it inside.",
  },
  {
    title: "Places: the minute before you go on.",
    body: "Your answers, your beats and your gesture, played back. Then go.",
  },
];

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // no storage: don't nag every visit
  }
}

export default function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === CARDS.length - 1;
  const done = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // fine
    }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") done();
      else if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
        if (last) done();
        else setI(i + 1);
      }
      else if (e.key === "ArrowLeft") setI(Math.max(0, i - 1));
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const c = CARDS[i];
  return (
    <div
      role="dialog"
      aria-label="How the Studio works"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "0 16px max(24px, env(safe-area-inset-bottom))",
        background: "linear-gradient(to top, rgba(11,11,12,0.92), rgba(11,11,12,0.35) 60%, rgba(11,11,12,0.1))",
        animation: `studio-in 500ms ${EASE}`,
      }}
    >
      <div style={{ width: "min(100%, 460px)", textAlign: "center" }}>
        <div key={i} style={{ animation: `studio-in 420ms ${EASE}` }}>
          <div style={{ ...display, fontSize: 28, lineHeight: 1.2, color: "#ededed" }}>{c.title}</div>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: "#a1a1a1", marginTop: 12 }}>{c.body}</p>
        </div>
        <div aria-hidden style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 22 }}>
          {CARDS.map((_, n) => (
            <span
              key={n}
              style={{
                width: n === i ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: n === i ? "#ededed" : "rgba(255,255,255,0.3)",
                transition: `width 300ms ${EASE}`,
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
          {!last && (
            <button
              type="button"
              onClick={done}
              style={{
                fontSize: 12,
                padding: "10px 18px",
                borderRadius: 6,
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.25)",
                color: "#a1a1a1",
                cursor: "pointer",
              }}
            >
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? done() : setI(i + 1))}
            style={{
              fontSize: 12,
              padding: "10px 22px",
              borderRadius: 6,
              background: "#ededed",
              border: "1px solid #ededed",
              color: "#000000",
              cursor: "pointer",
            }}
          >
            {last ? "Start" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
