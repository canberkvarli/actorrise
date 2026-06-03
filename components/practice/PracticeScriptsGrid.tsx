"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { IconArrowRight, IconDots, IconLoader2 } from "@tabler/icons-react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";
import { useDeleteScript, type UserScript } from "@/hooks/useScripts";

interface PracticeScriptsGridProps {
  scripts: UserScript[];
  /** ID of the most-recent user script — accented as the "Resume" action. */
  featuredScriptId: number | null;
  /** ID of the system sample (`is_sample=true`), so the empty state can link to it. */
  demoScriptId: number | null;
}

/**
 * The library grid — the hero of /practice.
 *
 * - Brand-new user (no own scripts): a spare, action-first empty state.
 * - Returning user: their scripts only (the demo is hidden once it's clutter).
 *   The most-recent script is accented with a "Resume" affordance.
 *
 * Cards are typographic — the script model carries no poster/cover field yet.
 */
export function PracticeScriptsGrid({
  scripts,
  featuredScriptId,
  demoScriptId,
}: PracticeScriptsGridProps) {
  const userScripts = scripts.filter((s) => !s.is_sample);

  if (userScripts.length === 0) {
    return <EmptyState demoScriptId={demoScriptId} />;
  }

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      <AnimatePresence mode="popLayout" initial={false}>
        {userScripts.map((script, idx) => (
          <ScriptCard
            key={script.id}
            script={script}
            index={idx}
            isResume={script.id === featuredScriptId}
          />
        ))}
      </AnimatePresence>
    </section>
  );
}

function EmptyState({ demoScriptId }: { demoScriptId: number | null }) {
  return (
    <section className="max-w-lg space-y-6">
      <p className="text-base text-muted-foreground leading-relaxed">
        Upload a script and rehearse with a partner reading every other role.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <UploadScriptButton variant="primary">Upload a script</UploadScriptButton>
        {demoScriptId != null && (
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="gap-1.5 h-11 px-3 font-medium text-foreground hover:text-foreground hover:bg-muted/60"
          >
            <Link href={`/practice/${demoScriptId}`}>
              Open the demo
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}

function ScriptCard({
  script,
  index,
  isResume,
}: {
  script: UserScript;
  index: number;
  isResume: boolean;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [prefetched, setPrefetched] = useState(false);
  const deleteScriptMutation = useDeleteScript();
  const href = `/practice/${script.id}`;

  // Prefetch the route bundle the first time the user hints intent (hover/touch/focus).
  // Cheap, idempotent — Next.js dedupes — and shaves the JS/data fetch off the click.
  const prefetchOnce = () => {
    if (prefetched) return;
    setPrefetched(true);
    router.prefetch(href);
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteScriptMutation.mutateAsync(script.id);
      toast.success("Script deleted");
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : "Failed to delete script";
      toast.error(typeof message === "string" ? message : "Failed to delete script");
    }
  };

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
  // The recent script is the obvious next action — accent it, but not while it's
  // still processing or has failed (nothing to resume yet).
  const showResume = isResume && !showStatusRow;

  return (
    <>
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.24), ease: [0.25, 0.1, 0.25, 1] }}
      onMouseEnter={prefetchOnce}
      onTouchStart={prefetchOnce}
      onFocus={prefetchOnce}
      className={[
        "group relative w-full text-left",
        "rounded-lg border bg-card",
        "min-h-[148px]",
        "transition-all duration-200",
        "hover:shadow-md hover:-translate-y-[1px]",
        showResume
          ? "border-[#CB4B00]/45 hover:border-[#CB4B00]/70"
          : "border-border/70 hover:border-border",
      ].join(" ")}
    >
      {/* Card body — clickable area for navigation. A native <button> so keyboard + screen-reader work. */}
      <button
        type="button"
        onClick={() => router.push(href)}
        className="w-full text-left px-5 py-5 sm:px-6 sm:py-6 min-h-[148px] flex flex-col justify-between cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
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

        {showResume && (
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#CB4B00] group-hover:text-[#B03000] transition-colors">
            Resume
            <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}

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
      </button>

      {/* Overflow menu — sibling of the card button so clicks aren't swallowed by the parent. */}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Script actions"
            className={[
              "absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center",
              "rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted/80",
              "transition-opacity",
              menuOpen
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus:opacity-100 focus-within:opacity-100",
            ].join(" ")}
          >
            <IconDots className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors rounded-sm"
            onClick={() => {
              setMenuOpen(false);
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete script
          </button>
        </PopoverContent>
      </Popover>
    </motion.div>
    <ConfirmDeleteDialog
      open={deleteDialogOpen}
      onOpenChange={setDeleteDialogOpen}
      title="Delete this script?"
      description="This deletes the script and all its scenes. Cannot be undone."
      confirmLabel="Delete script"
      onConfirm={handleConfirmDelete}
      isLoading={deleteScriptMutation.isPending}
    />
    </>
  );
}

export default PracticeScriptsGrid;
