"use client";

import { IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";

interface ActiveFilterChipsProps {
  filters: Record<string, string>;
  labels: Record<string, string>;
  onRemove: (key: string) => void;
  onClearAll: () => void;
}

export function ActiveFilterChips({ filters, labels, onRemove, onClearAll }: ActiveFilterChipsProps) {
  const activeEntries = Object.entries(filters).filter(([, v]) => v !== "");

  if (activeEntries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <AnimatePresence mode="popLayout">
        {activeEntries.map(([key, value]) => (
          <motion.button
            key={key}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={() => onRemove(key)}
            className="t-active-filter"
          >
            <span className="t-active-filter__key">{labels[key] || key}</span>
            <span className="t-active-filter__val">{value}</span>
            <IconX className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
          </motion.button>
        ))}
      </AnimatePresence>
      {activeEntries.length > 1 && (
        <button type="button" onClick={onClearAll} className="t-active-filter__clear">
          clear all
        </button>
      )}
    </div>
  );
}
