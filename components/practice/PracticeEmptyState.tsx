"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconArrowRight, IconUpload } from "@tabler/icons-react";

interface PracticeEmptyStateProps {
  /** ID of the system sample script (`is_sample=true`) the user can try as a demo. */
  demoScriptId?: number | null;
  /** Called when the user clicks "Upload your first script". Should open the upload flow. */
  onUploadClick: () => void;
}

/**
 * Hero shown when the user has no scripts of their own.
 * Single column, sharp corners on the supporting copy, rounded only on buttons.
 */
export function PracticeEmptyState({ demoScriptId, onUploadClick }: PracticeEmptyStateProps) {
  return (
    <div className="py-10 sm:py-16">
      <div className="space-y-4">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight font-serif text-foreground">
          Practice scenes with an AI scene partner
        </h1>
        <p className="text-base text-muted-foreground max-w-xl leading-relaxed">
          Upload a script and rehearse with an AI partner reading every other role.
        </p>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:items-center">
        <Button
          size="lg"
          onClick={onUploadClick}
          className="gap-2 h-11 px-5 font-medium bg-[#CB4B00] hover:bg-[#B03000] text-white border-[#CB4B00] hover:border-[#B03000]"
        >
          <IconUpload className="h-4 w-4" />
          Upload your first script
        </Button>

        {demoScriptId != null && (
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="gap-1.5 h-11 px-3 font-medium text-foreground hover:text-foreground hover:bg-muted/60"
          >
            <Link href={`/my-scripts/${demoScriptId}`}>
              Try the demo script
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export default PracticeEmptyState;
