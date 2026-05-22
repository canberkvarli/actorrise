"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { IconDots, IconLoader2 } from "@tabler/icons-react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
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
  // Demo is only useful for brand-new users. Once they have their own scripts,
  // it's clutter — hide it from the library grid.
  const ordered =
    userScripts.length > 0 ? userScripts : [...userScripts, ...sampleScripts];

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
          <AnimatePresence mode="popLayout" initial={false}>
            {ordered.map((script, idx) => (
              <ScriptCard key={script.id} script={script} index={idx} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function ScriptCard({ script, index }: { script: UserScript; index: number }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const deleteScriptMutation = useDeleteScript();

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

  return (
    <>
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.24), ease: [0.25, 0.1, 0.25, 1] }}
      className={[
        "group relative w-full text-left",
        "rounded-lg border bg-card",
        "min-h-[148px]",
        "transition-all duration-200",
        "hover:shadow-md hover:-translate-y-[1px]",
        script.is_sample
          ? "border-dashed border-border/50 bg-muted/30 opacity-90 hover:opacity-100 hover:border-border/70"
          : "border-border/70 hover:border-border",
      ].join(" ")}
    >
      {/* Card body — clickable area for navigation. A native <button> so keyboard + screen-reader work. */}
      <button
        type="button"
        onClick={() => router.push(`/practice/${script.id}`)}
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

      {/* Demo corner tag — sharp corners, non-clickable */}
      {script.is_sample && (
        <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wide text-muted-foreground bg-background/80 px-1.5 py-0.5 border border-border font-medium pointer-events-none">
          Demo
        </span>
      )}

      {/* Overflow menu — sibling of the card button so clicks aren't swallowed by the parent. */}
      {!script.is_sample && (
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
      )}
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
