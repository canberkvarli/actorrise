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
import { useDeleteScript, useReorderScripts, type UserScript } from "@/hooks/useScripts";

interface PracticeLibraryProps {
  /** All scripts (user + demo). */
  scripts: UserScript[];
  /** Most-recent user script — kept for the deep-link fallback. */
  featuredScriptId: number | null;
  /** System sample id. */
  demoScriptId: number | null;
  /** Opens the playbill. Lives on the shelf's header row — see below. */
  onOpenWalkthrough?: () => void;
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
  onOpenWalkthrough,
}: PracticeLibraryProps) {
  const userScripts = scripts.filter((s) => !s.is_sample);
  const demoScripts = scripts.filter((s) => s.is_sample);
  // User scripts first, demos pinned last (The Breakup + Hamlet). They stay
  // available as a quick "see how it works" even for returning users.
  const ordered = [...userScripts, ...demoScripts];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserScript | null>(null);
  const deleteScript = useDeleteScript();
  const reorderScripts = useReorderScripts();
  const { user } = useAuth();
  const router = useRouter();
  const {
    data: whatsNext,
    isLoading: whatsNextLoading,
    isError: whatsNextFailed,
  } = useWhatsNext();

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
      {/* The room: the work on the left, the shelf on the right — until a
          script is open, when the script takes the whole room and the shelf
          drops below it. The design keeps both columns in that state, and at
          1440 the scene titles truncate to "The b…" and "The f…", which is
          the one thing a list of scenes cannot afford to do. */}
      <div
        className={
          selectedScript
            ? "flex flex-col gap-12"
            : "grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-12"
        }
      >
        {/* The stage. One region, two things it can hold, and the swap between
            them is the only motion on the screen after load.
            The id is the ScenePartner tour's first anchor: it is on the region
            rather than on WhatsNext itself so the light still has something to
            land on while the stage is a skeleton or holding an open script. */}
        <div id="scenepartner-stage" className="min-w-0">
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
                  className="t-back-to-stage mb-5"
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
                ) : whatsNextFailed ? (
                  /* A failed lookup is not an empty shelf. Rendering NothingYet
                     here would tell an actor with four scripts that their first
                     scene starts here, which reads as "your work is gone" — and
                     it would have happened to everyone in the window between
                     this shipping and the endpoint going live behind it. Say
                     what went wrong; the shelf beside this still has their
                     scripts, so nobody is stranded. */
                  <div className="max-w-md">
                    <p className="font-typewriter text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      couldn&apos;t reach the prompt desk
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      I couldn&apos;t work out where you left off. Your scripts are
                      all still here, on the right.
                    </p>
                  </div>
                ) : userScripts.length > 0 ? (
                  /* Succeeded and found nothing, but they do own scripts: those
                     scripts are still waiting to be cut, so point at the shelf
                     rather than asking for another upload. */
                  <div className="max-w-md">
                    <p className="font-typewriter text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      nothing on tonight
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Pick a script from the shelf to see what&apos;s in it.
                    </p>
                  </div>
                ) : (
                  <NothingYet />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* The shelf */}
        <div className="min-w-0">
          {/* The way in sits at the top of the shelf, not under it. Below the
              list it was the last thing on the page and moved further down with
              every script added, so the more you used ScenePartner the harder
              it got to add to it. */}
          {/* "how this room works" used to have a full-width row of its own
              above this whole grid, which bought one line of house text an
              entire band of the page and pushed the stage and the shelf down
              by it. It is a footnote, so it sits on the line that is already
              here — the shelf's rule — beside the thing it explains. */}
          <div
            className="mb-3 flex items-center justify-between gap-3 pb-3"
            style={{ borderBottom: "1.5px solid var(--t-line-dark-2)" }}
          >
            <h2 className="t-shelf-heading">On the shelf</h2>
            <div className="flex items-center gap-3">
              {onOpenWalkthrough && (
                <button type="button" onClick={onOpenWalkthrough} className="t-how-link">
                  how this room works
                </button>
              )}
              <span id="scenepartner-bring-in">
                <UploadScriptButton variant="compact" className="t-bring-in">Bring in a script</UploadScriptButton>
              </span>
            </div>
          </div>
          {/* The tour's third anchor is the rail alone, not the column: the
              column already contains the "bring in a script" step's target, so
              lighting it would show the same pill twice. */}
          <div id="scenepartner-shelf">
            <PracticeLibraryRail
              scripts={ordered}
              selectedId={effectiveId}
              onSelect={setSelectedId}
              onRequestDelete={setDeleteTarget}
              onReport={handleReport}
              orientation="column"
              onReorder={(scriptIds) => {
                // The shelf has already moved on screen. A toast here would fire
                // on every drag; the arrangement showing up where it was dropped
                // is the confirmation. Only a failure needs saying.
                reorderScripts.mutate(scriptIds, {
                  onError: () => toast.error("Couldn't save the new order"),
                });
              }}
            />
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
