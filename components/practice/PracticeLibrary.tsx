"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconArrowRight, IconPlayerPlayFilled } from "@tabler/icons-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { HelpVideoDialog } from "@/components/help/HelpVideoDialog";
import { FIRST_SCENE_VIDEO } from "@/lib/help-videos";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";
import { PracticeLibraryRail } from "@/components/practice/PracticeLibraryRail";
import { PracticeScenePanel } from "@/components/practice/PracticeScenePanel";
import { useDeleteScript, type UserScript } from "@/hooks/useScripts";

interface PracticeLibraryProps {
  /** All scripts (user + demo). */
  scripts: UserScript[];
  /** Most-recent user script — the default selection. */
  featuredScriptId: number | null;
  /** System sample id (selected by default for brand-new users). */
  demoScriptId: number | null;
}

/**
 * Two-pane practice library: a script picker (left rail / mobile chips) and the
 * selected script's scenes (right). Opens on the most-recent script, or the
 * demo for brand-new users. Selection lives here; scenes load lazily in the panel.
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

  // ?script={id} (e.g. coming back from the editor, or after an upload) preselects
  // that script. Falls back to most-recent, then the demo.
  const searchParams = useSearchParams();
  const paramScriptId = Number(searchParams.get("script")) || null;
  const paramId =
    paramScriptId && ordered.some((s) => s.id === paramScriptId) ? paramScriptId : null;

  const defaultId = paramId ?? featuredScriptId ?? demoScriptId ?? ordered[0]?.id ?? null;
  const isValid = selectedId != null && ordered.some((s) => s.id === selectedId);
  const effectiveId = isValid ? selectedId : defaultId;
  const selectedScript = ordered.find((s) => s.id === effectiveId) ?? null;

  if (ordered.length === 0) {
    return <EmptyState demoScriptId={demoScriptId} />;
  }

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
      <div className="grid gap-6 lg:grid-cols-[300px_1fr] lg:gap-10">
        <aside className="lg:border-r lg:border-border/60 lg:pr-6">
          <PracticeLibraryRail
            scripts={ordered}
            selectedId={effectiveId}
            onSelect={setSelectedId}
            onRequestDelete={setDeleteTarget}
            onReport={handleReport}
          />
        </aside>

        {selectedScript && <PracticeScenePanel key={selectedScript.id} script={selectedScript} />}
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

function EmptyState({ demoScriptId }: { demoScriptId: number | null }) {
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center">
      <p className="stage-direction text-xs sm:text-sm text-muted-foreground/70">
        (an empty stage. for now.)
      </p>
      <h1 className="mt-4 max-w-xl font-sans text-3xl sm:text-4xl font-medium tracking-[-0.02em] text-balance">
        Your first <em className="italic text-primary">scene</em> starts here.
      </h1>
      <p className="mt-4 max-w-md text-base text-muted-foreground leading-relaxed">
        Upload any script and rehearse with a partner that reads every other
        role, holds your lines, and never misses a cue.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center justify-center">
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

      {FIRST_SCENE_VIDEO.youtubeId && (
        <>
          <button
            type="button"
            onClick={() => setVideoOpen(true)}
            className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconPlayerPlayFilled className="h-3.5 w-3.5" />
            Watch how it works ({FIRST_SCENE_VIDEO.durationLabel})
          </button>
          <HelpVideoDialog
            youtubeId={FIRST_SCENE_VIDEO.youtubeId}
            title={FIRST_SCENE_VIDEO.title}
            open={videoOpen}
            onOpenChange={setVideoOpen}
          />
        </>
      )}
    </section>
  );
}

export default PracticeLibrary;
