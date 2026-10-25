"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useShare, useShareable } from "@/hooks/useShelf";
import { describeCharacter, formatLength, TONES, type ShareableScene } from "@/lib/shelf";

const SELECT =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

/* Share a scene from one of the actor's own uploads. What goes on the shelf is
   where the scene is, never its words: another actor brings their own copy. */
export function ShareSceneDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const shareable = useShareable(open);
  const share = useShare();
  const [picked, setPicked] = useState<ShareableScene | null>(null);
  const [work, setWork] = useState("");
  const [kind, setKind] = useState<"play" | "film" | "tv">("play");
  const [where, setWhere] = useState("");
  const [title, setTitle] = useState("");
  const [tone, setTone] = useState("");
  const [showName, setShowName] = useState(true);
  const [done, setDone] = useState(false);

  const pick = (s: ShareableScene) => {
    setPicked(s);
    setWork(s.script_title);
    setTitle(s.title);
    setTone(s.tone && (TONES as readonly string[]).includes(s.tone) ? s.tone : "");
    setWhere("");
  };

  const reset = () => {
    setPicked(null);
    setDone(false);
    share.reset();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked || !work.trim() || !where.trim()) return;
    share.mutate(
      { scene_id: picked.scene_id, work_title: work.trim(), work_kind: kind, where: where.trim(),
        title: title.trim() || undefined, tone: tone || undefined, show_name: showName },
      { onSuccess: () => setDone(true) },
    );
  };

  const items = shareable.data?.items ?? [];
  const open_ = items.filter((s) => !s.already_shared);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{done ? "It's on the shelf" : picked ? "Where is it?" : "Share a scene"}</DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 text-sm">
            <p>Other actors will see where to find it and bring their own copy. You&apos;re a contributor now.</p>
            <Button onClick={() => { onOpenChange(false); reset(); }}>Done</Button>
          </div>
        ) : !picked ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Only where the scene is goes up, never the script.</p>
            {shareable.isLoading && <p className="text-muted-foreground">Loading your scenes…</p>}
            {!shareable.isLoading && items.length === 0 && (
              <p>
                You haven&apos;t uploaded a script yet.{" "}
                <Link href="/practice" className="text-primary underline-offset-4 hover:underline">Upload one in ScenePartner</Link>.
              </p>
            )}
            {!shareable.isLoading && items.length > 0 && open_.length === 0 && (
              <p>Every scene you have is on the shelf already.</p>
            )}
            <ul className="divide-y divide-border border-y border-border">
              {open_.map((s) => (
                <li key={s.scene_id}>
                  <button
                    type="button"
                    onClick={() => pick(s)}
                    className="w-full cursor-pointer px-1 py-3 text-left hover:bg-accent"
                  >
                    <span className="block font-medium">{s.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[s.script_title, s.characters.map((c) => c.name).join(" & "), formatLength(s.duration_seconds)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              {picked.characters.map(describeCharacter).join(" & ")} · {formatLength(picked.duration_seconds)}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="shelf-work">From</Label>
              <div className="flex gap-2">
                <Input id="shelf-work" value={work} onChange={(e) => setWork(e.target.value)} maxLength={200} required />
                <select aria-label="Kind" className={`${SELECT} w-28`} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                  <option value="play">Play</option>
                  <option value="film">Film</option>
                  <option value="tv">TV</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shelf-where">Where it is</Label>
              <Input
                id="shelf-where"
                value={where}
                onChange={(e) => setWhere(e.target.value)}
                placeholder="Act 2, the garden · about 40 minutes in · S1E3"
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shelf-title">Call it</Label>
              <Input id="shelf-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shelf-tone">Tone</Label>
              <select id="shelf-tone" className={SELECT} value={tone} onChange={(e) => setTone(e.target.value)}>
                <option value="">Not sure</option>
                {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={showName} onChange={(e) => setShowName(e.target.checked)} />
              Show my first name on it
            </label>
            {share.isError && <p className="text-destructive">{(share.error as Error).message}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setPicked(null)}>Back</Button>
              <Button type="submit" disabled={share.isPending || !work.trim() || !where.trim()}>
                {share.isPending ? "Sharing…" : "Share it"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
