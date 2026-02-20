"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconFileText, IconArrowRight, IconUpload, IconDeviceTv } from "@tabler/icons-react";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import api from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface UserScript {
  id: number;
  title: string;
  author: string;
  processing_status: "pending" | "processing" | "completed" | "failed";
  num_scenes_extracted: number;
  created_at: string;
}

async function fetchScripts(): Promise<UserScript[]> {
  const { data } = await api.get<UserScript[]>("/api/scripts/");
  return data;
}

const scriptRowBase =
  "flex items-center gap-3 w-full text-left p-4 rounded-lg border border-border/60 transition-all duration-200 group " +
  "hover:shadow-md hover:border-secondary/50 hover:bg-secondary/5 cursor-pointer";

export default function ScriptsQuickAccess() {
  const router = useRouter();
  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ["scripts-list"],
    queryFn: fetchScripts,
    enabled: SCRIPTS_FEATURE_ENABLED,
    staleTime: 60 * 1000,
  });

  const recentScripts = scripts.slice(0, 3);
  const totalCount = scripts.length;

  const cardClass = "rounded-lg border border-border/50 min-h-[280px] flex flex-col";
  const contentClass = "pt-4 pb-4 flex flex-col flex-1 min-h-[252px]";

  if (!SCRIPTS_FEATURE_ENABLED) {
    return (
      <Card className={cardClass}>
        <CardContent className={`${contentClass} items-center justify-center py-8 text-center`}>
          <div className="rounded-full bg-muted/80 p-4 mb-3 text-muted-foreground">
            <IconFileText className="h-8 w-8" />
          </div>
          <p className="text-sm font-medium text-foreground">Your scripts</p>
          <p className="text-xs text-muted-foreground mt-1 px-4">
            Save scripts from Film & TV and rehearse with Scene Partner. Coming soon.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4 gap-1.5 rounded-lg">
            <Link href="/my-scripts">
              Learn more
              <IconArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cardClass}>
      <CardContent className={contentClass}>
        {isLoading ? (
          <div className="space-y-3 flex-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted/50 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : recentScripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 py-8 px-4 text-center">
            <div className="rounded-full bg-amber-500/15 p-4 mb-3 text-amber-600 dark:text-amber-400">
              <IconFileText className="h-8 w-8" />
            </div>
            <p className="text-sm font-medium text-foreground">No scripts yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload or paste scripts from film & TV to edit and rehearse with Scene Partner.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <Button asChild size="sm" variant="default" className="gap-1.5 rounded-lg">
                <Link href="/my-scripts">
                  <IconUpload className="h-3.5 w-3.5" />
                  Add script
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="gap-1.5 rounded-lg">
                <Link href="/search?mode=film_tv">
                  <IconDeviceTv className="h-3.5 w-3.5" />
                  Film & TV
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {recentScripts.map((script) => (
              <button
                key={script.id}
                type="button"
                onClick={() => router.push(`/my-scripts/${script.id}`)}
                className={scriptRowBase}
              >
                <div className="p-2 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex-shrink-0" aria-hidden>
                  <IconFileText className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                    {script.title}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {script.author}
                    {script.processing_status === "completed" && script.num_scenes_extracted > 0 && (
                      <> · {script.num_scenes_extracted} scene{script.num_scenes_extracted !== 1 ? "s" : ""}</>
                    )}
                  </div>
                </div>
                <IconArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </button>
            ))}
            {totalCount > 3 && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-fit shrink-0 rounded-lg border-border hover:bg-muted/50 text-foreground text-sm mt-1"
              >
                <Link href="/my-scripts" className="cursor-pointer text-inherit hover:text-inherit whitespace-nowrap">
                  View all {totalCount}
                  <IconArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
