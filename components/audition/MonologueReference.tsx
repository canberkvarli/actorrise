'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { IconBook, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import type { Monologue } from '@/types/actor';

interface MonologueReferenceProps {
  monologue: Monologue;
  open: boolean;
  onToggle: () => void;
}

/**
 * On-screen reference / teleprompter for a specific monologue.
 * Collapsible + scrollable so it never blocks the record controls.
 * Sits below the video; mobile-first.
 */
export function MonologueReference({ monologue, open, onToggle }: MonologueReferenceProps) {
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <IconBook className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">Your lines</p>
            <p className="text-[11px] text-white/40 truncate">{monologue.title}</p>
          </div>
        </div>
        {open ? (
          <IconChevronUp className="w-4 h-4 text-white/40 shrink-0" />
        ) : (
          <IconChevronDown className="w-4 h-4 text-white/40 shrink-0" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/10 px-5 py-4 max-h-[40vh] overflow-y-auto">
              <p
                className="font-sans text-[15px] sm:text-base text-white/85 leading-[1.9] whitespace-pre-wrap"
              >
                {monologue.text}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
