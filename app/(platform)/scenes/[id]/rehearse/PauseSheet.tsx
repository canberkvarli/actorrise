'use client';

import { motion } from 'framer-motion';

interface Props { onResume: () => void; onRestart: () => void; onLeave: () => void }

const ROW = 'flex min-h-12 w-full items-center text-left';

/** The page dims a step and this rises from the bottom: three words, no icons. */
export function PauseSheet({ onResume, onRestart, onLeave }: Props) {
  return (
    <motion.div role="dialog" aria-label="Paused"
      initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.18, ease: 'easeOut' }}
      className="r-chrome fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md px-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-4 text-xl"
      style={{ background: 'var(--t-paper)' }}>
      <button type="button" className={ROW} onClick={onResume} autoFocus>Resume</button>
      <button type="button" className={ROW} onClick={onRestart}>Start over</button>
      <button type="button" className={`${ROW} r-soft`} onClick={onLeave}>Leave</button>
    </motion.div>
  );
}
