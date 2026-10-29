import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.actorrise.com";

type Item = {
  kind: "speech" | "sides";
  title: string;
  character?: string | null;
  work?: string | null;
  author?: string | null;
  minutes?: number | null;
};
type Shared = { title: string; by?: string | null; items: Item[] };
type Props = { params: Promise<{ token: string }> };

async function load(token: string): Promise<Shared | null> {
  const res = await fetch(`${apiUrl}/api/book/shared/${encodeURIComponent(token)}`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  return (await res.json()) as Shared;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const list = await load(token);
  if (!list) return { title: "A list", robots: { index: false } };
  const who = list.by ? `${list.by}'s` : "An actor's";
  return {
    title: `${list.title}`,
    description: `${who} list on Ghost Light: ${list.items.length} ${list.items.length === 1 ? "piece" : "pieces"}.`,
    // A list someone sent is for the person they sent it to, not for search engines.
    robots: { index: false, follow: false },
  };
}

function minutes(m?: number | null): string | null {
  if (!m) return null;
  const whole = Math.floor(m);
  const secs = Math.round((m - whole) * 60);
  return `${whole}:${String(secs).padStart(2, "0")}`;
}

/**
 * A list an actor sent from Ghost Light: to an agent, a teacher, a friend. The
 * pieces by title, who speaks them and where they come from, and how long they
 * run. Never the words: those are the actor's to bring into the room.
 */
export default async function SharedListPage({ params }: Props) {
  const { token } = await params;
  const list = await load(token);
  if (!list) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-16 sm:py-24">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {list.by ? `From ${list.by}, on Ghost Light` : "From Ghost Light"}
      </p>
      <h1 className="mt-3 font-brand text-4xl leading-tight text-foreground sm:text-5xl">{list.title}</h1>
      <p className="mt-3 text-muted-foreground">
        {list.items.length} {list.items.length === 1 ? "piece" : "pieces"}
      </p>

      <ol className="mt-10 divide-y divide-border/60 border-y border-border/60">
        {list.items.map((item, i) => (
          <li key={i} className="flex items-baseline gap-4 py-5">
            <span className="w-6 shrink-0 font-mono text-sm text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-brand text-xl text-foreground">{item.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.kind === "sides"
                  ? ["Sides", item.author].filter(Boolean).join(" · ")
                  : [item.character, item.work, item.author].filter(Boolean).join(" · ")}
              </p>
            </div>
            {minutes(item.minutes) ? (
              <span className="shrink-0 font-mono text-sm text-muted-foreground">{minutes(item.minutes)}</span>
            ) : null}
          </li>
        ))}
      </ol>

      <p className="mt-12 text-sm text-muted-foreground">
        Made with Ghost Light, the app actors use to find a monologue and run their scenes.{" "}
        <Link href="/" className="text-primary underline underline-offset-4">
          See it
        </Link>
      </p>
    </main>
  );
}
