"use client";

import Link from "next/link";

import { UploadScriptButton } from "@/components/practice/UploadScriptButton";
import type { TrialWords } from "@/lib/trial";

interface SceneWinProps {
  /** A stage direction for the eyebrow, parentheses included. */
  direction?: string;
  title?: string;
  /** The trial ask, when this actor may be shown one. */
  offer?: { visible: boolean; href: string; accept: () => void };
  trial: TrialWords;
  onAgain: () => void;
  /** A restart is on its way. */
  restarting: boolean;
  onLeave: () => void;
  leaveLabel: string;
}

/**
 * The end of a first scene.
 *
 * What stood here was a tinted box with a bold line, a grey line and a stock
 * button: the app's default card, on the one screen where an actor has just
 * said words out loud to a stranger's voice and had them answered. It read as
 * the success page of a file converter.
 *
 * This is the invitation's own page, turned round. The invitation is a cue, a
 * line in the display face, a sentence of house text and one pill. So is this:
 * the same faces at the same sizes, so the scene opens and closes in one room.
 *
 * Two ways on, not one. "Bring in your sides" was the only door, and five
 * actors uploaded a script in sixty days; most people who finish this scene do
 * not have sides on their phone. The library is the other door, dashed the way
 * every "I don't know what I want yet" door in the app is dashed.
 *
 * It carries no theatre surface of its own: the rehearse page already is one.
 */
export function SceneWin({
  direction = "(lights down.)",
  title = "That was your first scene.",
  offer,
  trial,
  onAgain,
  restarting,
  onLeave,
  leaveLabel,
}: SceneWinProps) {
  return (
    <section className="t-win" aria-labelledby="scene-win-title">
      <p className="t-win__dir">{direction}</p>
      <h1 id="scene-win-title" className="t-win__title">
        {title}
      </h1>
      <p className="t-win__house">That one was mine. The next is yours.</p>

      <div className="t-win__doors">
        <UploadScriptButton variant="primary" className="t-win__cta">
          Bring in your sides
        </UploadScriptButton>
        <Link href="/monologues" className="t-win__alt">
          Find a monologue
        </Link>
      </div>

      {/* Two lines, each whole. As one sentence the link broke across the
          line on a phone, "Plus, two" above "weeks free". */}
      {offer?.visible && (
        <p className="t-win__earned">
          <span>
            {trial.earned ? "Finishing that earned you a second week." : "Or take the whole room."}
          </span>
          <a href={offer.href} onClick={offer.accept}>
            Plus, {trial.span} free
          </a>
        </p>
      )}

      <div className="t-win__foot">
        <button type="button" className="t-win__quiet" onClick={onAgain} disabled={restarting}>
          {restarting ? "one moment" : "run it again"}
        </button>
        <button type="button" className="t-win__quiet" onClick={onLeave}>
          {leaveLabel}
        </button>
      </div>
    </section>
  );
}
