"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconArrowRight } from "@tabler/icons-react";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";

interface PracticeEmptyStateProps {
  /** ID of the system sample script (`is_sample=true`) the user can try as a demo. */
  demoScriptId?: number | null;
}

/**
 * Hero shown when the user has no scripts of their own.
 * Single column, sharp corners on the supporting copy, rounded only on buttons.
 */
export function PracticeEmptyState({ demoScriptId }: PracticeEmptyStateProps) {
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
        <UploadScriptButton variant="primary">
          Upload your first script
        </UploadScriptButton>

        {demoScriptId != null && (
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="gap-1.5 h-11 px-3 font-medium text-foreground hover:text-foreground hover:bg-muted/60"
          >
            <Link href={`/practice/${demoScriptId}`}>
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
