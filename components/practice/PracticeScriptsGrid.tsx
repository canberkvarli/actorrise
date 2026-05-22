"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { IconLoader2 } from "@tabler/icons-react";

import { Skeleton } from "@/components/ui/skeleton";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";
import type { UserScript } from "@/hooks/useScripts";

interface PracticeScriptsGridProps {
  scripts: UserScript[];
  isLoading: boolean;
}

/**
 * Visual grid of script cards. Demo (`is_sample=true`) is pinned to the end.
 *
 * Cards are typographic — the script model does not currently carry any
 * poster/cover/image field. If one is added later (e.g. `cover_image_url`),
 * render it as a 3:4 hero atop the card and demote the typographic block.
 */
export function PracticeScriptsGrid({
  scripts,
  isLoading,
}: PracticeScriptsGridProps) {
  const userScripts = scripts.filter((s) => !s.is_sample);
  const sampleScripts = scripts.filter((s) => s.is_sample);
  const ordered = [...userScripts, ...sampleScripts];

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-foreground">
            Your library.
          </h2>
        </div>
        <UploadScriptButton variant="compact" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : ordered.length === 0 ? (
        <div className="border border-dashed border-border/60 bg-muted/20 py-10 px-6 text-center">
          <p className="text-sm text-muted-foreground">No scripts yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {ordered.map((script, idx) => (
            <ScriptCard key={script.id} script={script} index={idx} />
          ))}
        </div>
      )}
    </section>
  );
}

function ScriptCard({ script, index }: { script: UserScript; index: number }) {
  const router = useRouter();

  const isProcessing =
    script.processing_status === "processing" ||
    script.processing_status === "pending";
  const isFailed = script.processing_status === "failed";

  const metaParts: string[] = [];
  if (script.author && !script.is_sample) metaParts.push(script.author);
  if (script.processing_status === "completed") {
    if (script.num_scenes_extracted > 0) {
      metaParts.push(
        `${script.num_scenes_extracted} scene${script.num_scenes_extracted !== 1 ? "s" : ""}`,
      );
    }
    if (script.num_characters > 0) {
      metaParts.push(
        `${script.num_characters} character${script.num_characters !== 1 ? "s" : ""}`,
      );
    }
  }

  const showStatusRow = isProcessing || isFailed;

  return (
    <motion.button
      type="button"
      onClick={() => router.push(`/practice/${script.id}`)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.24), ease: [0.25, 0.1, 0.25, 1] }}
      className={[
        "group relative w-full text-left",
        "rounded-lg border bg-card",
        "px-5 py-5 sm:px-6 sm:py-6",
        "min-h-[148px] flex flex-col justify-between",
        "transition-all duration-200",
        "hover:shadow-md hover:-translate-y-[1px] cursor-pointer",
        script.is_sample
          ? "border-dashed border-border/50 bg-muted/30 opacity-90 hover:opacity-100 hover:border-border/70"
          : "border-border/70 hover:border-border",
      ].join(" ")}
    >
      {/* Demo corner tag — sharp corners, non-clickable */}
      {script.is_sample && (
        <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wide text-muted-foreground bg-background/80 px-1.5 py-0.5 border border-border font-medium">
          Demo
        </span>
      )}

      <div className="space-y-1.5 pr-12">
        <h3 className="font-serif text-lg sm:text-xl tracking-tight text-foreground line-clamp-2 leading-snug">
          {script.title}
        </h3>
        {metaParts.length > 0 && (
          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
            {metaParts.join(" · ")}
          </p>
        )}
      </div>

      {showStatusRow && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground/80">
          {isProcessing && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 border border-border font-medium">
              <IconLoader2 className="h-3 w-3 animate-spin" />
              Processing
            </span>
          )}
          {isFailed && (
            <span className="text-[10px] uppercase tracking-wide text-destructive bg-destructive/10 px-1.5 py-0.5 border border-destructive/30 font-medium">
              Failed
            </span>
          )}
        </div>
      )}
    </motion.button>
  );
}

export default PracticeScriptsGrid;
