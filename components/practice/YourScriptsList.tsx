"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconUpload, IconChevronRight, IconLoader2 } from "@tabler/icons-react";
import type { UserScript } from "@/hooks/useScripts";

interface YourScriptsListProps {
  scripts: UserScript[];
  isLoading: boolean;
  onUploadClick: () => void;
  uploading?: boolean;
}

function ScriptRow({ script }: { script: UserScript }) {
  const router = useRouter();
  const subtitleParts: string[] = [];
  if (script.author) subtitleParts.push(script.author);
  if (script.processing_status === "completed") {
    if (script.num_characters > 0) {
      subtitleParts.push(
        `${script.num_characters} character${script.num_characters !== 1 ? "s" : ""}`
      );
    }
    if (script.num_scenes_extracted > 0) {
      subtitleParts.push(
        `${script.num_scenes_extracted} scene${script.num_scenes_extracted !== 1 ? "s" : ""}`
      );
    }
  }

  const isProcessing = script.processing_status === "processing" || script.processing_status === "pending";
  const isFailed = script.processing_status === "failed";

  return (
    <button
      type="button"
      onClick={() => router.push(`/my-scripts/${script.id}`)}
      className="group w-full text-left flex items-center gap-4 p-4 rounded-lg border border-border/70 bg-card hover:border-border hover:shadow-md transition-all duration-200 cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-base text-foreground font-serif truncate group-hover:text-foreground transition-colors">
            {script.title}
          </h3>
          {script.is_sample && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 border border-border font-medium">
              Demo
            </span>
          )}
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
        {subtitleParts.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground truncate">
            {subtitleParts.join(" · ")}
          </p>
        )}
      </div>
      <IconChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
    </button>
  );
}

export function YourScriptsList({
  scripts,
  isLoading,
  onUploadClick,
  uploading = false,
}: YourScriptsListProps) {
  // Demo (is_sample) scripts pinned at the bottom; user scripts ordered as-given.
  const userScripts = scripts.filter((s) => !s.is_sample);
  const sampleScripts = scripts.filter((s) => s.is_sample);
  const ordered = [...userScripts, ...sampleScripts];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight font-serif text-foreground">
          Your scripts
        </h2>
        <Button
          size="sm"
          onClick={onUploadClick}
          disabled={uploading}
          className="gap-1.5 h-9 px-3 font-medium bg-[#CB4B00] hover:bg-[#B03000] text-white border-[#CB4B00] hover:border-[#B03000]"
        >
          {uploading ? (
            <>
              <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <IconUpload className="h-3.5 w-3.5" />
              Upload script
            </>
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
          ))}
        </div>
      ) : ordered.length === 0 ? (
        <div className="border border-dashed border-border/60 bg-muted/20 py-10 px-6 text-center">
          <p className="text-sm text-muted-foreground">No scripts yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map((script) => (
            <ScriptRow key={script.id} script={script} />
          ))}
        </div>
      )}
    </section>
  );
}

export default YourScriptsList;
