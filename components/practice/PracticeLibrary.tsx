"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconArrowRight, IconPlayerPlayFilled } from "@tabler/icons-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { getGenreDotClassName } from "@/lib/genreColors";
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

  // First run means "nothing of your own yet" — not "nothing at all". The API
  // hands every account the sample scripts, so keying the welcome off the total
  // meant it never showed in production and its demo button was unreachable.
  if (userScripts.length === 0) {
    return <EmptyState demos={demoScripts} />;
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
      <div className="space-y-5">
        <div>
          <h2 className="mb-3 font-typewriter text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Your shelf
          </h2>
          <PracticeLibraryRail
            scripts={ordered}
            selectedId={effectiveId}
            onSelect={setSelectedId}
            onRequestDelete={setDeleteTarget}
            onReport={handleReport}
          />
        </div>

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

function EmptyState({ demos }: { demos: UserScript[] }) {
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <section className="flex flex-col items-center justify-center px-4 py-4 text-center sm:py-6">
      <p className="stage-direction text-sm sm:text-base text-muted-foreground/70">
        (an empty stage. for now.)
      </p>
      <h1 className="mt-4 max-w-2xl font-brand text-4xl sm:text-5xl md:text-6xl font-medium leading-[1.05] text-balance">
        Your first <em className="italic text-primary">scene</em> starts here.
      </h1>
      <p className="mt-4 max-w-md text-base text-muted-foreground leading-relaxed">
        Upload any script and rehearse with a partner that reads every other
        role, holds your lines, and never misses a cue.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center justify-center">
        <UploadScriptButton variant="primary">Upload a script</UploadScriptButton>
      </div>

      {/* Free carried 0 script uploads until 2026-08-11, so "upload a script"
          read as an invitation to hit a paywall. It now includes one, and saying
          so is the difference between trying and assuming. */}
      <p className="mt-4 text-xs text-muted-foreground">
        Your first script is free.
      </p>

      {/* Nothing of your own yet — so borrow one of mine and hear it work. */}
      {demos.length > 0 && (
        <div className="mt-8 w-full max-w-lg">
          <p className="stage-direction text-xs text-muted-foreground/70">
            (or borrow one of mine.)
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {demos.map((demo) => (
              <Link prefetch={false}
                key={demo.id}
                href={`/practice/${demo.id}`}
                className="group relative overflow-hidden rounded-lg border border-border/60 bg-card/30 py-4 pl-5 pr-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30"
              >
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-1 opacity-70 ${getGenreDotClassName(demo.genre)}`}
                />
                <p className="font-typewriter text-sm font-semibold text-foreground">
                  {demo.title}
                </p>
                <p className="mt-0.5 truncate font-typewriter text-xs text-muted-foreground">
                  {demo.author}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
                  Open it
                  <IconArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {FIRST_SCENE_VIDEO.youtubeId && (
        <>
          <button
            type="button"
            onClick={() => setVideoOpen(true)}
            /* Bare text button, so its box was only as tall as the line (20px).
               px-3 keeps the label visually where it was while giving the tap
               a real 44px box on the page new actors actually land on. */
            className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground md:min-h-0 md:px-0"
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
