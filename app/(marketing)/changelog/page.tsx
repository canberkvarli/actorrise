import type { Metadata } from "next";
import { readFile } from "fs/promises";
import path from "path";
import type { ChangelogData, ChangelogEntry, ChangelogCategory } from "@/lib/changelog";
import Image from "next/image";
import { cn } from "@/lib/utils";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "What's new in ActorRise. Features, improvements, and fixes for monologue search and audition prep.",
  openGraph: {
    title: "Changelog | ActorRise",
    description: "Latest updates to ActorRise: new features, improvements, and fixes.",
    url: `${siteUrl}/changelog`,
  },
  alternates: { canonical: `${siteUrl}/changelog` },
};

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function CategoryBadge({ category }: { category: ChangelogCategory }) {
  const styles: Record<ChangelogCategory, string> = {
    feature:
      "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 border rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide",
    improvement:
      "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 border rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide",
    fix: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30 border rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide",
  };
  const labels: Record<ChangelogCategory, string> = {
    feature: "Feature",
    improvement: "Improvement",
    fix: "Fix",
  };
  return <span className={cn(styles[category])}>{labels[category]}</span>;
}

async function getChangelogData(): Promise<ChangelogData> {
  const filePath = path.join(process.cwd(), "public", "changelog.json");
  const raw = await readFile(filePath, "utf-8");
  const data = JSON.parse(raw) as ChangelogData;
  if (!data?.updates || !Array.isArray(data.updates)) {
    return { updates: [] };
  }
  return data;
}

export default async function ChangelogPage() {
  const { updates } = await getChangelogData();
  const sorted = [...updates].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="container mx-auto px-4 sm:px-6 py-12 md:py-20 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-2 font-brand">
        Changelog
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        What&apos;s new in ActorRise
      </p>

      <ul className="space-y-8">
        {sorted.map((entry: ChangelogEntry) => (
          <li key={entry.id} className="border-b border-border/60 pb-8 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <CategoryBadge category={entry.category} />
              <time
                dateTime={entry.date}
                className="text-xs text-muted-foreground"
              >
                {formatDate(entry.date)}
              </time>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {entry.emoji && <span className="mr-2" aria-hidden>{entry.emoji}</span>}
              {entry.title}
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              {entry.description}
            </p>
            {entry.image_url && (
              <div className="rounded-lg overflow-hidden border border-border/60 bg-muted/30">
                <Image
                  src={entry.image_url}
                  alt=""
                  width={640}
                  height={360}
                  className="w-full h-auto object-cover"
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {sorted.length === 0 && (
        <p className="text-muted-foreground">No updates yet. Check back soon.</p>
      )}
    </div>
  );
}
