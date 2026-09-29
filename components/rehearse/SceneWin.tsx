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
 * What Plus adds over free, and nothing it does not. Free is three runs a
 * month, one script and three monologue sessions (pricing_tiers); Plus is
 * unlimited runs, five scripts and every monologue. If the tiers change, this
 * list changes with them.
 */
const PLUS_GETS: Array<[label: string, value: string]> = [
  ["Runs", "as many as it takes"],
  ["Your scripts", "five on the shelf"],
  ["Monologues", "every one, out loud"],
];

/**
 * The end of a first scene.
 *
 * The invitation's own page, turned round: a direction, a line in the display
 * face, a sentence of house text. Same faces at the same sizes, so the scene
 * opens and closes in one room.
 *
 * The offer is a ticket, not a sentence. It was one underlined link under two
 * buttons, which is how a price gets read as a footnote; of the first dozen
 * actors to finish this scene, one tapped it. A ticket is the same object the
 * box office at /checkout hands over, at the size of a stub: the plan, the
 * length of the trial, three printed rows of what it admits to, and the pill.
 * When it is on the page it is the one filled button, and the two doors go
 * dashed beside each other underneath. When it is not (already on Plus, or
 * asked recently), the doors are the page, as before.
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
  const asking = !!offer?.visible;

  return (
    <section className="t-win" aria-labelledby="scene-win-title" data-asking={asking ? "true" : undefined}>
      <p className="t-win__dir">{direction}</p>
      <h1 id="scene-win-title" className="t-win__title">
        {title}
      </h1>
      <p className="t-win__house">That one was mine. The next is yours.</p>

      {asking && offer && (
        <div className="t-win__ticket" role="group" aria-label="Plus">
          <div className="t-win__ticket-head">
            <p className="t-win__plan">Plus</p>
            <span className="t-win__tag">{trial.short}</span>
          </div>
          {trial.earned && (
            <p className="t-win__earned-note">Finishing that scene earned you the second week.</p>
          )}
          <ul className="t-win__gets">
            {PLUS_GETS.map(([label, value]) => (
              <li key={label}>
                <span className="t-win__get-label">{label}</span>
                <span className="t-win__get-lead" aria-hidden />
                <span className="t-win__get-val">{value}</span>
              </li>
            ))}
          </ul>
          <div className="t-win__tear" aria-hidden />
          <a href={offer.href} onClick={offer.accept} className="t-win__cta t-win__cta--ticket">
            {trial.cta}
          </a>
          <p className="t-win__fine">$0 today. Cancel any time.</p>
        </div>
      )}

      <div className="t-win__doors" data-beside={asking ? "true" : undefined}>
        <UploadScriptButton variant="primary" className={asking ? "t-win__alt" : "t-win__cta"}>
          Bring in your sides
        </UploadScriptButton>
        <Link href="/monologues" className="t-win__alt">
          Find a monologue
        </Link>
      </div>

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
