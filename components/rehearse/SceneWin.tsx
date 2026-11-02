"use client";

import Link from "next/link";

import { UploadScriptButton } from "@/components/practice/UploadScriptButton";
import type { TrialWords } from "@/lib/trial";
import { useT, type MessageKey } from "@/lib/i18n";

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
  /** Pieces the onboarding card kept on the way here; 0 says nothing. */
  kept?: number;
}

/**
 * What Plus adds over free, and nothing it does not. Free is one run a
 * month, one script and two monologue sessions (pricing_tiers); Plus is
 * unlimited runs, five scripts and every monologue. If the tiers change, this
 * list changes with them.
 */
const PLUS_GETS: Array<[label: MessageKey, value: MessageKey]> = [
  ["appScenesWin.runsLabel", "appScenesWin.runsValue"],
  ["appScenesWin.scriptsLabel", "appScenesWin.scriptsValue"],
  ["appScenesWin.monologuesLabel", "appScenesWin.monologuesValue"],
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
  direction,
  title,
  offer,
  trial,
  onAgain,
  restarting,
  onLeave,
  leaveLabel,
  kept = 0,
}: SceneWinProps) {
  const t = useT();
  const asking = !!offer?.visible;

  return (
    <section className="t-win" aria-labelledby="scene-win-title" data-asking={asking ? "true" : undefined}>
      <p className="t-win__dir">{direction ?? t("appScenesWin.direction")}</p>
      <h1 id="scene-win-title" className="t-win__title">
        {title ?? t("appScenesWin.title")}
      </h1>
      <p className="t-win__house">{t("appScenesWin.house")}</p>

      {asking && offer && (
        <div className="t-win__ticket" role="group" aria-label={t("appScenesWin.plus")}>
          <div className="t-win__ticket-head">
            <p className="t-win__plan">{t("appScenesWin.plus")}</p>
            <span className="t-win__tag">{trial.short}</span>
          </div>
          {trial.earned && (
            <p className="t-win__earned-note">{t("appScenesWin.earned")}</p>
          )}
          <ul className="t-win__gets">
            {PLUS_GETS.map(([label, value]) => (
              <li key={label}>
                <span className="t-win__get-label">{t(label)}</span>
                <span className="t-win__get-lead" aria-hidden />
                <span className="t-win__get-val">{t(value)}</span>
              </li>
            ))}
          </ul>
          <div className="t-win__tear" aria-hidden />
          <a href={offer.href} onClick={offer.accept} className="t-win__cta t-win__cta--ticket">
            {trial.cta}
          </a>
          <p className="t-win__fine">{t("appScenesWin.fine")}</p>
        </div>
      )}

      <div className="t-win__doors" data-beside={asking ? "true" : undefined}>
        <UploadScriptButton variant="primary" className={asking ? "t-win__alt" : "t-win__cta"}>
          {t("appScenesWin.sides")}
        </UploadScriptButton>
        <Link href="/monologues" className="t-win__alt">
          {t("appScenesWin.findMonologue")}
        </Link>
        {kept > 0 && (
          <Link href="/rehearse" className="t-win__alt">
            {t(kept === 1 ? "appScenesWin.keptOne" : "appScenesWin.keptMany", { n: kept })}
          </Link>
        )}
      </div>

      <div className="t-win__foot">
        <button type="button" className="t-win__quiet" onClick={onAgain} disabled={restarting}>
          {restarting ? t("appScenesWin.oneMoment") : t("appScenesWin.runAgain")}
        </button>
        <button type="button" className="t-win__quiet" onClick={onLeave}>
          {leaveLabel}
        </button>
      </div>
    </section>
  );
}
