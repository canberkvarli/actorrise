"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { IconX } from "@tabler/icons-react";

import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Three rows asking what you have been cast in.
 *
 * The full editor lives at /resume and keeps its six fields. This asks four,
 * because `actor_credits.category` is NOT NULL and quietly defaulting everyone
 * to "theatre" would mislabel every screen actor's résumé, which they then
 * export to a PDF. Stage or screen is one tap; /resume refines it to TV,
 * commercial or voiceover.
 *
 * It writes to the existing POST /api/resume/credits, so /resume and the PDF
 * keep working untouched.
 */

type Credit = {
  id: number;
  production: string;
  role?: string | null;
  year?: string | null;
  category: string;
};

type Draft = { production: string; role: string; year: string; category: string };

const EMPTY: Draft = { production: "", role: "", year: "", category: "theatre" };
const ROWS = 3;

export function CreditsInline({ onChanged }: { onChanged?: () => void }) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    Array.from({ length: ROWS }, () => ({ ...EMPTY })),
  );

  const { data } = useQuery({
    queryKey: ["resume-credits"],
    queryFn: async () => (await api.get<Credit[]>("/api/resume/credits")).data,
    staleTime: 30_000,
  });
  const credits = Array.isArray(data) ? data : [];

  const add = useMutation({
    mutationFn: (d: Draft) =>
      api.post("/api/resume/credits", {
        production: d.production.trim(),
        role: d.role.trim() || null,
        year: d.year.trim() || null,
        category: d.category,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resume-credits"] });
      qc.invalidateQueries({ queryKey: ["actor-lane"] });
      onChanged?.();
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/resume/credits/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resume-credits"] });
      qc.invalidateQueries({ queryKey: ["actor-lane"] });
      onChanged?.();
    },
  });

  const setRow = (i: number, patch: Partial<Draft>) =>
    setDrafts((rows) => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const commit = (i: number) => {
    const d = drafts[i];
    if (!d.production.trim() || add.isPending) return;
    add.mutate(d);
    setRow(i, { ...EMPTY });
  };

  return (
    <div className="space-y-3">
      {credits.length > 0 && (
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {credits.map((c) => (
              <motion.li
                key={c.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="group flex items-baseline gap-2 text-sm"
              >
                <span className="font-typewriter text-foreground">
                  {c.role?.trim() || "—"}
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span className="font-typewriter min-w-0 truncate text-muted-foreground">
                  {c.production}
                </span>
                {c.year && (
                  <span className="text-xs text-muted-foreground/60">{c.year}</span>
                )}
                <button
                  type="button"
                  onClick={() => remove.mutate(c.id)}
                  aria-label={`Remove ${c.production}`}
                  className="ml-1 text-muted-foreground/40 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {drafts.map((d, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <Input
            value={d.production}
            onChange={(e) => setRow(i, { production: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && commit(i)}
            placeholder={i === 0 ? "Hamlet" : "Show or film"}
            className="min-w-0 flex-[2]"
            aria-label="Production"
          />
          <Input
            value={d.role}
            onChange={(e) => setRow(i, { role: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && commit(i)}
            placeholder={i === 0 ? "Laertes" : "Role"}
            className="min-w-0 flex-[2]"
            aria-label="Role"
          />
          <Input
            value={d.year}
            onChange={(e) => setRow(i, { year: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && commit(i)}
            placeholder="2024"
            className="w-20 shrink-0"
            aria-label="Year"
          />
          {/* Stage or screen, one tap. Never a silent default. */}
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-border">
            {(["theatre", "film"] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={d.category === c}
                onClick={() => setRow(i, { category: c })}
                className={`px-3 py-2 text-xs transition-colors ${
                  d.category === c
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c === "theatre" ? "Stage" : "Screen"}
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!d.production.trim() || add.isPending}
            onClick={() => commit(i)}
            className="shrink-0"
          >
            Add
          </Button>
        </div>
      ))}
    </div>
  );
}
