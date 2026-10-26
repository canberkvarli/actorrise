"use client";

import { useState } from "react";
import { IconLoader2 } from "@tabler/icons-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useDecline, useShare, useShareable, useWithdraw } from "@/hooks/useShelf";
import { describeCharacter, guessWorkKind, shareMoment, type ShareableScene } from "@/lib/shelf";

/*
 * Sharing a scene, where the scene came in.
 *
 * What goes up is a pointer: the title, the two parts and where the scene sits
 * in the work. Never a line of the script (backend/app/api/shelf.py). An actor
 * is asked twice at most for a scene: once when the script's scenes are built,
 * and once more, in one line, after running a scene they said "not now" to.
 */

const PILL =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-opacity disabled:opacity-60";
const PRIMARY = `${PILL} bg-primary text-primary-foreground hover:opacity-90`;
const QUIET = `${PILL} text-[color:var(--t-muted-light)] hover:text-[color:var(--t-text)]`;

/** The ask above an opened script's scenes, at whichever moment is due. */
export function ShareAsk({ scriptId }: { scriptId: number }) {
  const shareable = useShareable(true, scriptId);
  const decline = useDecline();
  const [sharing, setSharing] = useState<ShareableScene | null>(null);
  const [sharedTitle, setSharedTitle] = useState<string | null>(null);
  /* One answer per visit. Without it a "not now" at upload on a script whose
     scenes are already run would bring the after-a-run nudge straight up. */
  const [answered, setAnswered] = useState(false);

  const items = shareable.data?.items ?? [];
  const moment = shareMoment(items);

  if (sharedTitle) {
    return (
      <Ask>
        <p className="text-sm text-[color:var(--t-text)]">
          {sharedTitle} is in the scene library. Actors who find it bring their own copy.
        </p>
        <div className="mt-2">
          <button type="button" className={QUIET} onClick={() => { setSharedTitle(null); setAnswered(true); }}>
            Done
          </button>
        </div>
      </Ask>
    );
  }
  if (!moment || answered) return null;

  const asked = moment.scenes;
  if (sharing) {
    return (
      <Ask>
        <ShareForm
          scene={sharing}
          choices={moment.kind === "upload" ? asked : undefined}
          onPick={setSharing}
          onCancel={() => setSharing(null)}
          onShared={() => {
            // The rest of this ask was asked too: a no to them, not a second ask.
            const rest = asked.filter((s) => s.scene_id !== sharing.scene_id).map((s) => s.scene_id);
            if (rest.length > 0) decline.mutate(rest);
            setSharedTitle(sharing.title);
            setSharing(null);
          }}
        />
      </Ask>
    );
  }

  const notNow = () => {
    setAnswered(true);
    decline.mutate(asked.map((s) => s.scene_id));
  };
  return (
    <Ask>
      <p className="text-sm leading-relaxed text-[color:var(--t-text)]">
        {moment.kind === "upload" ? (
          <>
            Other actors are looking for scenes like this. Share where it is?{" "}
            <span className="text-[color:var(--t-muted-light)]">
              Only the title and where it sits go up, never your script.
            </span>
          </>
        ) : (
          <>You ran {asked[0].title}. Share where it is, so other actors can find it?</>
        )}
      </p>
      <div className="mt-2.5 flex items-center gap-1">
        <button type="button" className={PRIMARY} onClick={() => setSharing(asked[0])}>
          Share
        </button>
        <button type="button" className={QUIET} onClick={notNow} disabled={decline.isPending}>
          Not now
        </button>
      </div>
    </Ask>
  );
}

function Ask({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 border-l-2 border-[color:var(--t-gel-ink)] py-1 pl-4" role="region" aria-label="Share with other actors">
      {children}
    </div>
  );
}

/**
 * The share, filled in from what the scene already knows. The one thing the
 * actor writes is where it is, and even that starts from the script's headings.
 */
export function ShareForm({
  scene,
  choices,
  onPick,
  onCancel,
  onShared,
}: {
  scene: ShareableScene;
  /** More than one scene in this ask: which one. */
  choices?: ShareableScene[];
  onPick?: (s: ShareableScene) => void;
  onCancel: () => void;
  onShared: () => void;
}) {
  const share = useShare();
  const [work, setWork] = useState(scene.script_title);
  const [kind, setKind] = useState(() => guessWorkKind(scene.where_guess));
  const [where, setWhere] = useState(scene.where_guess);
  const [showName, setShowName] = useState(false);
  const [lastScene, setLastScene] = useState(scene.scene_id);

  // Picking another scene in the same ask starts from that one's headings.
  if (lastScene !== scene.scene_id) {
    setLastScene(scene.scene_id);
    setWhere(scene.where_guess);
    setKind(guessWorkKind(scene.where_guess));
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!work.trim() || !where.trim()) return;
    share.mutate(
      {
        scene_id: scene.scene_id,
        work_title: work.trim(),
        work_kind: kind,
        author: scene.script_author ?? undefined,
        where: where.trim(),
        show_name: showName,
      },
      { onSuccess: onShared },
    );
  };

  const facts = [scene.characters.map(describeCharacter).join(" & "), scene.tone].filter(Boolean).join(" · ");

  return (
    <form onSubmit={submit} className="max-w-md space-y-3 text-sm">
      {choices && choices.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Which scene">
          {choices.map((c) => (
            <button
              key={c.scene_id}
              type="button"
              role="radio"
              aria-checked={c.scene_id === scene.scene_id}
              onClick={() => onPick?.(c)}
              className="rounded-full border border-[color:var(--t-line-light)] px-3 py-1 text-[13px] text-[color:var(--t-muted-light)] aria-checked:border-[color:var(--t-text)] aria-checked:text-[color:var(--t-text)]"
            >
              {c.title}
            </button>
          ))}
        </div>
      )}
      <p className="text-[color:var(--t-muted-light)]">
        <span className="font-semibold text-[color:var(--t-text)]">{scene.title}</span>
        {facts ? ` · ${facts}` : ""}
      </p>
      <label className="block space-y-1">
        <span className="text-xs text-[color:var(--t-muted-light)]">Where it is</span>
        <Input
          autoFocus
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          placeholder="Act 2, the garden · 40 minutes in · S1E3"
          maxLength={200}
          required
        />
      </label>
      <div className="flex gap-2">
        <label className="block min-w-0 flex-1 space-y-1">
          <span className="text-xs text-[color:var(--t-muted-light)]">From</span>
          <Input value={work} onChange={(e) => setWork(e.target.value)} maxLength={200} required />
        </label>
        <label className="block w-24 space-y-1">
          <span className="text-xs text-[color:var(--t-muted-light)]">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="h-10 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="play">Play</option>
            <option value="film">Film</option>
            <option value="tv">TV</option>
          </select>
        </label>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-[color:var(--t-muted-light)]">
        <Checkbox checked={showName} onChange={(e) => setShowName(e.target.checked)} />
        Show my first name on it
      </label>
      {share.isError && <p className="text-destructive">{(share.error as Error).message}</p>}
      <div className="flex items-center gap-1">
        <button type="submit" className={PRIMARY} disabled={share.isPending || !work.trim() || !where.trim()}>
          {share.isPending && <IconLoader2 className="h-3.5 w-3.5 animate-spin" />}
          Share
        </button>
        <button type="button" className={QUIET} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * The quiet option inside a built scene's fold: share it, or, once shared,
 * how many actors picked it up and a way to take it down.
 */
export function ShareRowAction({ item }: { item: ShareableScene | undefined }) {
  const [open, setOpen] = useState(false);
  const withdraw = useWithdraw();
  if (!item) return null;

  if (item.ask === "shared" && item.shelf_id != null) {
    const shelfId = item.shelf_id;
    return (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--t-muted-light)]">
        <span>
          In the scene library
          {item.open_count > 0 ? ` · ${item.open_count} ${item.open_count === 1 ? "actor" : "actors"} picked it up` : ""}
        </span>
        <button
          type="button"
          className="underline-offset-4 hover:text-[color:var(--t-text)] hover:underline"
          onClick={() => withdraw.mutate(shelfId)}
          disabled={withdraw.isPending}
        >
          Take it down
        </button>
      </p>
    );
  }

  if (open) return <ShareForm scene={item} onCancel={() => setOpen(false)} onShared={() => setOpen(false)} />;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="text-xs text-[color:var(--t-muted-light)] underline-offset-4 hover:text-[color:var(--t-text)] hover:underline"
    >
      Share with other actors
    </button>
  );
}
