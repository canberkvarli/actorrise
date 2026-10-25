"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useMyShares, useRehearseShelf, useSetStatus, useShelf, useWithdraw } from "@/hooks/useShelf";
import { AGES, describeCharacter, formatLength, sourceLine, TONES, type ShelfFilters, type ShelfScene } from "@/lib/shelf";
import { ShareSceneDialog } from "./ShareSceneDialog";

const SELECT =
  "h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring";

const PAIRINGS: { value: ShelfFilters["pairing"]; label: string }[] = [
  { value: undefined, label: "Any two" },
  { value: "mf", label: "Man & woman" },
  { value: "ff", label: "Two women" },
  { value: "mm", label: "Two men" },
];

export function ShelfPage() {
  const [filters, setFilters] = useState<ShelfFilters>({});
  const [search, setSearch] = useState("");
  const [sharing, setSharing] = useState(false);

  // Typing settles before it asks the server.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: search || undefined })), 300);
    return () => clearTimeout(t);
  }, [search]);

  const shelf = useShelf(filters);
  const mine = useMyShares();
  const scenes = shelf.data?.pages.flatMap((p) => p.items) ?? [];
  const total = shelf.data?.pages[0]?.total ?? 0;

  const set = <K extends keyof ShelfFilters>(key: K, value: ShelfFilters[K] | "") =>
    setFilters((f) => ({ ...f, [key]: value || undefined }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">Scenes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Two-person scenes to rehearse, some shared by actors.</p>
        </div>
        <div className="flex items-center gap-3">
          {mine.data?.contributor && (
            <span className="border border-primary px-2 py-0.5 text-xs text-primary">
              Contributor · {mine.data.opens} {mine.data.opens === 1 ? "actor" : "actors"} opened yours
            </span>
          )}
          <Button onClick={() => setSharing(true)}>Share a scene</Button>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {PAIRINGS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => set("pairing", p.value)}
              data-active={filters.pairing === p.value}
              className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm data-[active=true]:border-foreground data-[active=true]:bg-foreground data-[active=true]:text-background"
            >
              {p.label}
            </button>
          ))}
        </div>
        <select aria-label="Age" className={SELECT} value={filters.age ?? ""} onChange={(e) => set("age", e.target.value)}>
          <option value="">Any age</option>
          {AGES.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select aria-label="Length" className={SELECT} value={filters.length ?? ""} onChange={(e) => set("length", e.target.value as ShelfFilters["length"])}>
          <option value="">Any length</option>
          <option value="short">Under 2 min</option>
          <option value="medium">2 to 3½ min</option>
          <option value="long">Over 3½ min</option>
        </select>
        <select aria-label="Tone" className={SELECT} value={filters.tone ?? ""} onChange={(e) => set("tone", e.target.value)}>
          <option value="">Any tone</option>
          {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="Era" className={SELECT} value={filters.era ?? ""} onChange={(e) => set("era", e.target.value as ShelfFilters["era"])}>
          <option value="">Any era</option>
          <option value="classical">Classical</option>
          <option value="modern">Modern</option>
        </select>
        <Input
          aria-label="Search scenes"
          placeholder="Play, character, moment"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full sm:w-56"
        />
      </div>

      {shelf.isLoading && <p className="text-sm text-muted-foreground">Loading scenes…</p>}
      {shelf.isError && <p className="text-sm text-destructive">The shelf didn&apos;t load. Try again in a moment.</p>}
      {!shelf.isLoading && !shelf.isError && scenes.length === 0 && (
        <p className="text-sm text-muted-foreground">No scenes match.</p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {scenes.map((scene) => <ShelfCard key={scene.id} scene={scene} />)}
      </ul>

      {shelf.hasNextPage && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="text-xs text-muted-foreground">{scenes.length} of {total}</span>
          <Button variant="outline" onClick={() => shelf.fetchNextPage()} disabled={shelf.isFetchingNextPage}>
            {shelf.isFetchingNextPage ? "Loading…" : "More scenes"}
          </Button>
        </div>
      )}

      <ShareSceneDialog open={sharing} onOpenChange={setSharing} />
    </div>
  );
}

function ShelfCard({ scene }: { scene: ShelfScene }) {
  const router = useRouter();
  const { user } = useAuth();
  const rehearse = useRehearseShelf();
  const setStatus = useSetStatus();
  const withdraw = useWithdraw();
  const [bringOwn, setBringOwn] = useState(false);

  const go = () =>
    rehearse.mutate(scene.id, {
      onSuccess: (r) => {
        if (r.scene_id) router.push(`/scenes/${r.scene_id}/rehearse`);
        else setBringOwn(true);
      },
    });

  const shared = scene.kind === "shared";
  const meta = [formatLength(scene.duration_seconds), scene.tone, scene.shared_by ? `shared by ${scene.shared_by}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium leading-snug">{scene.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{sourceLine(scene)}</p>
        </div>
        {shared && <span className="shrink-0 border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">Shared</span>}
      </div>
      <p className="text-sm">{scene.characters.map(describeCharacter).join(" & ")}</p>
      {scene.description && <p className="line-clamp-2 text-sm text-muted-foreground">{scene.description}</p>}
      {meta && <p className="text-xs text-muted-foreground">{meta}</p>}

      {bringOwn ? (
        <div className="mt-1 border-t border-border pt-3 text-sm">
          <p>
            This one lives in <span className="font-medium">{scene.work_title}</span>
            {scene.where ? `, ${scene.where}` : ""}. Upload your copy and pick this scene.
          </p>
          <Link href="/practice" className="mt-2 inline-block text-primary underline-offset-4 hover:underline">
            Upload in ScenePartner
          </Link>
        </div>
      ) : (
        <div className="mt-auto flex items-center gap-3 pt-2">
          <Button size="sm" onClick={go} disabled={rehearse.isPending}>
            {rehearse.isPending ? "Opening…" : shared && !scene.is_mine ? "Bring your copy" : "Rehearse"}
          </Button>
          {scene.is_mine && (
            <button
              type="button"
              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
              onClick={() => withdraw.mutate(scene.id)}
              disabled={withdraw.isPending}
            >
              Take it down
            </button>
          )}
          {user?.is_moderator && !scene.is_mine && (
            <button
              type="button"
              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setStatus.mutate({ id: scene.id, status: "hidden" })}
              disabled={setStatus.isPending}
            >
              Hide
            </button>
          )}
          {rehearse.isError && <span className="text-xs text-destructive">{(rehearse.error as Error).message}</span>}
        </div>
      )}
    </li>
  );
}
