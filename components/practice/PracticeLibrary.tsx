"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { IconArrowLeft } from "@tabler/icons-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";
import { PracticeLibraryRail } from "@/components/practice/PracticeLibraryRail";
import { PracticeScenePanel } from "@/components/practice/PracticeScenePanel";
import { WhatsNext, NothingYet } from "@/components/practice/WhatsNext";
import { useWhatsNext } from "@/hooks/useWhatsNext";
import { useDeleteScript, type UserScript } from "@/hooks/useScripts";

interface PracticeLibraryProps {
  /** All scripts (user + demo). */
  scripts: UserScript[];
  /** Most-recent user script — kept for the deep-link fallback. */
  featuredScriptId: number | null;
  /** System sample id. */
  demoScriptId: number | null;
}

/**
 * The rehearsal room: what you were working on, and the shelf it came off.
 *
 * This was a two-pane library that opened on the most recently *uploaded*
 * script — a filing order, not a working one. Now the stage leads with the next
 * real thing to do (see useWhatsNext), and a script is only selected when you
 * reach for one. Selection lives here; scenes load lazily in the panel.
 */
export function PracticeLibrary({
  scripts,
  featuredScriptId,
  demoScriptId,
}: PracticeLibraryProps) {
  const userScripts = scripts.filter((s) => !s.is_sample);
  const demoScripts = scripts.filter((s) => s.is_sample);
  // User scripts first, demos pinned last (The Breakup + Hamlet). They stay
  // available as a quick "see how it works" even for returning users.
  const ordered = [...userScripts, ...demoScripts];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserScript | null>(null);
  const deleteScript = useDeleteScript();
  const { user } = useAuth();
  const router = useRouter();
  const { data: whatsNext, isLoading: whatsNextLoading } = useWhatsNext();

  // ?script={id} (e.g. coming back from the editor, or after an upload) preselects
  // that script. Falls back to most-recent, then the demo.
  const searchParams = useSearchParams();
  const paramScriptId = Number(searchParams.get("script")) || null;
  const paramId =
    paramScriptId && ordered.some((s) => s.id === paramScriptId) ? paramScriptId : null;

  // Nothing is selected by default any more. The stage opens on what you were
  // actually doing; a script is only "selected" once you reach for one on the
  // shelf, or arrive back here from the editor with ?script= set. Picking the
  // most recent upload as a default is what made this a file browser.
  const paramSelected = paramId ? ordered.find((s) => s.id === paramId) ?? null : null;
  const isValid = selectedId != null && ordered.some((s) => s.id === selectedId);
  const effectiveId = isValid ? selectedId : paramSelected?.id ?? null;
  const selectedScript = ordered.find((s) => s.id === effectiveId) ?? null;

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteScript.mutateAsync(deleteTarget.id);
      toast.success("Script deleted");
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : "Failed to delete script";
      toast.error(typeof message === "string" ? message : "Failed to delete script");
    }
  };

  const handleReport = async (script: UserScript) => {
    if (!user?.email) {
      toast.error("Couldn't flag this — please use Contact in the menu.");
      return;
    }
    try {
      await api.post("/api/contact", {
        name: user.name?.trim() || "Actor",
        email: user.email,
        category: "bug",
        message: `Script extraction issue — "${script.title}" (#${script.id}). The scenes may not have extracted correctly; please take a look.`,
      });
      toast.success(`Thanks for flagging "${script.title}". I'll take a look.`);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : "Couldn't flag this — try Contact in the menu.";
      toast.error(
        typeof message === "string" ? message : "Couldn't flag this — try Contact in the menu.",
      );
    }
  };

  return (
    <>
      {/* The room: the work on the left, the shelf on the right.
          It was a header, then a shelf, then a panel, stacked — which reads as
          a file browser however the type is set. The split gives the work the
          larger measure and demotes the shelf to what it is: where the rest of
          it lives until you reach for it. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-12">
        {/* The stage. One region, two things it can hold, and the swap between
            them is the only motion on the screen after load. */}
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            {selectedScript ? (
              <motion.div
                key={`script-${selectedScript.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="min-w-0"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    // The deep-link is what put us here; clear it or the
                    // back-to-stage button appears to do nothing on remount.
                    router.replace("/practice", { scroll: false });
                  }}
                  className="mb-4 inline-flex items-center gap-1.5 font-typewriter text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <IconArrowLeft className="h-3.5 w-3.5" />
                  back to the stage
                </button>
                <PracticeScenePanel script={selectedScript} />
              </motion.div>
            ) : (
              <motion.div
                key="stage"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="min-w-0"
              >
                {whatsNextLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-14 w-3/4" />
                    <Skeleton className="h-20 w-full max-w-md" />
                    <Skeleton className="h-11 w-40" />
                  </div>
                ) : whatsNext ? (
                  <WhatsNext data={whatsNext} />
                ) : (
                  <NothingYet />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* The shelf */}
        <div className="min-w-0 lg:border-l lg:border-border/50 lg:pl-10">
          <h2 className="mb-3 font-typewriter text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            On the shelf
          </h2>
          <PracticeLibraryRail
            scripts={ordered}
            selectedId={effectiveId}
            onSelect={setSelectedId}
            onRequestDelete={setDeleteTarget}
            onReport={handleReport}
            orientation="column"
          />
          <div className="mt-4">
            <UploadScriptButton variant="compact">Bring in a script</UploadScriptButton>
          </div>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this script?"
        description="This deletes the script and all its scenes. Cannot be undone."
        confirmLabel="Delete script"
        onConfirm={handleConfirmDelete}
        isLoading={deleteScript.isPending}
      />
    </>
  );
}


export default PracticeLibrary;
