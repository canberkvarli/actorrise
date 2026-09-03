'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const LOADING_TEXTS = [
  "Warming up the stage lights...",
  "Getting into character...",
  "Brushing up on the lines...",
  "Setting the scene...",
  "Cueing the spotlight...",
];

export default function RehearsalLoading() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % LOADING_TEXTS.length), 2500);
    return () => clearInterval(t);
  }, []);

  // Same warm near-black the stage itself uses, and forced dark the same way.
  // This was bg-neutral-950 — a colder, flatter black — so arriving at a scene
  // went light page, one dark, then a second slightly different dark. Matching
  // it makes that a single clean change of light.
  return (
    <div className="dark fixed inset-0 z-[10050] flex items-center justify-center bg-[#191410]">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-primary" />
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="text-sm text-white/45"
        >
          {LOADING_TEXTS[idx]}
        </motion.p>
      </div>
    </div>
  );
}
