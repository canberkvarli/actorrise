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
    <div className="flex flex-wrap items-center gap-2">
      <AnimatePresence mode="popLayout">
        {activeEntries.map(([key, value]) => (
          <motion.button
            key={key}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            onClick={() => onRemove(key)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <span className="text-muted-foreground">{labels[key] || key}:</span>
            <span className="font-medium capitalize">{value}</span>
            <IconX className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </motion.button>
        ))}
      </AnimatePresence>
      {activeEntries.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear all
        </Button>
      )}
    </div>
  );
}
