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

  return (
    <div className="fixed inset-0 bg-neutral-950 flex items-center justify-center z-[10050]">
      <div className="text-center space-y-4">
        <div className="h-8 w-8 rounded-full border-2 border-neutral-700 border-t-primary animate-spin mx-auto" />
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="text-neutral-500 text-sm"
        >
          {LOADING_TEXTS[idx]}
        </motion.p>
      </div>
    </div>
  );
}
