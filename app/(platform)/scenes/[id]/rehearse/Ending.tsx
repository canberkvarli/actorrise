'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SceneWin } from '@/components/rehearse/SceneWin';
import { useTrialOffer } from '@/components/billing/TrialOffer';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrialWords } from '@/hooks/useTrialWords';
import { GATE_COPY } from '@/lib/paywall/copy';
import type { ScenePayload } from '@/lib/rehearsal/contract';

interface Props { scene: ScenePayload['scene']; guided: boolean; onAgain: () => void; onLeave: () => void }

/** The last line holds this long before anything is said about it. */
const HOLD_MS = 1000;
/**
 * When the trial length is first asked for again. Finishing a scene is what
 * earns the second week (backend/app/services/trial_length.py reads it off the
 * journal), so the ask waits for the run's `completed` event to land first;
 * /me is cached for a minute and would otherwise still quote one week.
 */
const RECOUNT_MS = 700;
/** Asked again this often until the server says the week is earned... */
const RECOUNT_EVERY_MS = 500;
/** ...and never longer than this: past it the page shows what it has. */
const RECOUNT_CAP_MS = 3000;

/** "Act 2, Scene 1": the data has "2" or "Act 2" for an act, "1" for a scene. */
export function whereInPlay(scene: ScenePayload['scene']): string {
  const act = scene.act?.trim();
  const sc = scene.scene_number?.trim();
  return [
    act ? (/^\d+$|^[IVXLC]+$/i.test(act) ? `Act ${act}` : act) : null,
    sc ? (/^\d+$|^[IVXLC]+$/i.test(sc) ? `Scene ${sc}` : sc) : null,
  ].filter(Boolean).join(', ');
}

/**
 * The moment: the last line stays where it is, then the house speaks.
 *
 * A guided run (the first scene, "Late") ends on its own page: SceneWin, with
 * the Plus ticket when this actor may be asked, quoting the trial they just
 * earned. Any other run ends on a card at the foot of the script.
 */
export function Ending({ scene, guided, onAgain, onLeave }: Props) {
  const [shown, setShown] = useState(false);
  /* The guided end does not open until the trial length is the real one. It
     asked once at 700ms and opened at 1000ms whatever had come back, so a slow
     journal write printed "1 week", then re-rendered to "2 weeks" with the
     earned note pushing the ticket down under the actor's eyes. */
  const [recounted, setRecounted] = useState(!guided);
  const { mutate } = useSubscription();
  useEffect(() => {
    const hold = setTimeout(() => setShown(true), HOLD_MS);
    return () => clearTimeout(hold);
  }, []);
  useEffect(() => {
    if (!guided) return;
    let alive = true;
    let next: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const ask = async () => {
      const data = await mutate().catch(() => undefined);
      if (!alive) return;
      if (data?.trial_earned || Date.now() - startedAt >= RECOUNT_CAP_MS - RECOUNT_EVERY_MS) {
        setRecounted(true);
      } else {
        next = setTimeout(ask, RECOUNT_EVERY_MS);
      }
    };
    const first = setTimeout(ask, RECOUNT_MS);
    const cap = setTimeout(() => { if (alive) setRecounted(true); }, RECOUNT_CAP_MS);
    return () => { alive = false; clearTimeout(first); clearTimeout(next); clearTimeout(cap); };
  }, [guided, mutate]);
  if (!shown || !recounted) return null;
  return guided ? <GuidedEnd onAgain={onAgain} onLeave={onLeave} /> : <RunEnd scene={scene} onAgain={onAgain} onLeave={onLeave} />;
}

/** Mounted only once it shows, so the offer records a show the actor saw. */
function GuidedEnd({ onAgain, onLeave }: { onAgain: () => void; onLeave: () => void }) {
  const offer = useTrialOffer('scene_completed', true, GATE_COPY.scene_completed.variant);
  const trial = useTrialWords();
  /* The offer takes its slot in an effect, a tick after mount, so its first
     render is always "no ticket". Drawn then, the page came up in its no-offer
     layout and re-laid itself a frame later with the ticket in: the flash at
     the end of the first scene. Wait for the decision, briefly. */
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 400);
    return () => clearTimeout(t);
  }, []);
  if (!offer.settled && !waited) return null;
  return (
    <motion.div className="r-win fixed inset-0 z-30 overflow-auto"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }}>
      <SceneWin offer={offer} trial={trial} onAgain={onAgain} restarting={false}
        onLeave={onLeave} leaveLabel="back to the room" />
    </motion.div>
  );
}

function RunEnd({ scene, onAgain, onLeave }: { scene: ScenePayload['scene']; onAgain: () => void; onLeave: () => void }) {
  const where = whereInPlay(scene);
  return (
    <motion.div role="status" className="r-end"
      initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      <p className="r-end__dir">(lights down.)</p>
      <p className="r-end__title">{where ? `${where}. ` : ''}Full run.</p>
      <div className="r-end__row">
        <button type="button" className="r-play r-play--wide" onClick={onAgain}>Again</button>
        <button type="button" className="r-end__leave" onClick={onLeave}>Leave</button>
      </div>
    </motion.div>
  );
}
