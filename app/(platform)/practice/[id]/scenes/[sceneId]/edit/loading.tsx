"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTList } from "@/lib/i18n";

export default function SceneEditLoading() {
  const tList = useTList();
  const LOADING_TEXTS = tList("appPracticeEditLoading.lines");
  const count = LOADING_TEXTS.length;
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % count), 2500);
    return () => clearInterval(t);
  }, [count]);

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <motion.div
          className="relative mx-auto"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="h-8 w-8 rounded-full border-2 border-neutral-700 border-t-primary animate-spin mx-auto" />
        </motion.div>
        <motion.p
          key={idx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-neutral-500 text-sm"
        >
          {LOADING_TEXTS[idx % count]}
        </motion.p>
      </div>
    </div>
  );
}
