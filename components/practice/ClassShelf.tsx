"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconChevronDown, IconSearch } from "@tabler/icons-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import {
  useClassShelves,
  useMySharing,
  useShareWithClass,
  type ClassShelf as Shelf,
  type ClassShelfScript,
} from "@/hooks/useClassShelf";
import type { UserScript } from "@/hooks/useScripts";
import { useAuth } from "@/lib/auth";
import { filterShelf } from "@/lib/classShelf";
import { formatSceneDuration } from "@/lib/scenes";

/** Scripts shown before "show all": a teacher may share hundreds. */
const FIRST_SHOWN = 6;

/**
 * "From Chris": the scripts a student's teacher shared with their class, one
 * shelf per teacher. Renders nothing for anyone who is not in a class with a
 * shelf, so it costs every other actor one empty request and no pixels.
 */
export function ClassShelves() {
  const { data: shelves } = useClassShelves();
  if (!shelves?.length) return null;
  return (
    <div className="mt-8 space-y-8">
      {shelves.map((shelf) => (
        <TeacherShelf key={shelf.teacher} shelf={shelf} />
      ))}
    </div>
  );
}

function TeacherShelf({ shelf }: { shelf: Shelf }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const matches = useMemo(() => filterShelf(shelf.scripts, query), [query, shelf.scripts]);
  const shown = all || query ? matches : matches.slice(0, FIRST_SHOWN);

  return (
    <section aria-label={`From ${shelf.teacher}`}>
      <div
        className="mb-3 flex items-baseline justify-between gap-3 pb-3"
        style={{ borderBottom: "1.5px solid var(--t-line-dark-2)" }}
      >
        <h2 className="t-shelf-heading">From {shelf.teacher}</h2>
        <span className="text-[12px] text-[color:var(--t-muted-light)]">
          {shelf.scripts.length} {shelf.scripts.length === 1 ? "script" : "scripts"}
        </span>
      </div>

      {shelf.scripts.length > FIRST_SHOWN && (
        <label className="mb-3 flex items-center gap-2 border-b border-[color:var(--t-line-light-2)] px-1 pb-2">
          <IconSearch className="h-3.5 w-3.5 shrink-0 text-[color:var(--t-muted-light)]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a scene or a character"
            className="w-full bg-transparent text-[14px] text-[color:var(--t-text)] placeholder:text-[color:var(--t-muted-light)] focus:outline-none"
          />
        </label>
      )}

      <ul className="divide-y divide-[color:var(--t-line-light-2)]">
        {shown.map((script) => (
          <ScriptRow
            key={script.id}
            script={script}
            open={openId === script.id || (!!query && matches.length <= 3)}
            onToggle={() => setOpenId(openId === script.id ? null : script.id)}
          />
        ))}
      </ul>
      {query && matches.length === 0 && (
        <p className="px-1 py-3 text-[13px] text-[color:var(--t-muted-light)]">Nothing on this shelf matches.</p>
      )}
      {!query && !all && matches.length > FIRST_SHOWN && (
        <button type="button" onClick={() => setAll(true)} className="t-shelf-link mt-3 px-1">
          show all {matches.length}
        </button>
      )}
    </section>
  );
}

function ScriptRow({ script, open, onToggle }: { script: ClassShelfScript; open: boolean; onToggle: () => void }) {
  // One scene: the script is the scene, so the row goes straight to it.
  if (script.scenes.length === 1) {
    const scene = script.scenes[0];
    return (
      <li>
        <SceneLink
          scriptId={script.id}
          scene={scene}
          title={script.title}
          // Two files from one film share its title; the scene's name tells them apart.
          subtitle={scene.title && scene.title !== script.title ? scene.title : undefined}
        />
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-md px-1 py-3 text-left transition-colors hover:text-[color:var(--t-gel-ink)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-[color:var(--t-text)]">{script.title}</span>
          <span className="block text-[13px] text-[color:var(--t-muted-light)]">{script.scenes.length} scenes</span>
        </span>
        <IconChevronDown
          className={`h-4 w-4 shrink-0 text-[color:var(--t-muted-light)] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul className="mb-2 ml-1 border-l border-[color:var(--t-line-light-2)] pl-3">
          {script.scenes.map((scene) => (
            <li key={scene.id}>
              <SceneLink scriptId={script.id} scene={scene} title={scene.title} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SceneLink({
  scriptId,
  scene,
  title,
  subtitle,
}: {
  scriptId: number;
  scene: ClassShelfScript["scenes"][number];
  title: string;
  subtitle?: string;
}) {
  return (
    <Link
      href={`/practice/${scriptId}/scenes/${scene.id}`}
      className="group flex items-center gap-3 rounded-md px-1 py-2.5 transition-colors"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-[color:var(--t-text)] group-hover:text-[color:var(--t-gel-ink)]">
          {title}
        </span>
        <span className="block truncate text-[13px] text-[color:var(--t-muted-light)]">
          {subtitle ? `${subtitle} · ` : ""}
          {scene.character_1_name} &amp; {scene.character_2_name} · {formatSceneDuration(scene.estimated_duration_seconds)}
        </span>
      </span>
      <span className="shrink-0 text-[12px] text-primary">Rehearse</span>
    </Link>
  );
}

/**
 * "Share with my class", on a script the teacher uploaded. Shown only to a
 * teacher account with a class link; off until they turn it on. A script a
 * moderator took down says so and cannot be switched back.
 */
export function ClassShareSwitch({ script }: { script: Pick<UserScript, "id" | "is_sample" | "class_share"> }) {
  const { user } = useAuth();
  const { data: sharing } = useMySharing(user?.account_type === "educator");
  const share = useShareWithClass();
  // Optimistic: the switch moves when tapped, and goes back if the server says no.
  const [pending, setPending] = useState<boolean | null>(null);
  if (!sharing?.can_share || script.is_sample) return null;

  if (script.class_share === "hidden") {
    return (
      <p className="mb-5 text-[13px] text-[color:var(--t-muted-light)]">
        This script was taken down from your class shelf. Write to canberk@actorrise.com about it.
      </p>
    );
  }
  const on = pending ?? script.class_share === "live";
  return (
    <div
      className="mb-5 flex items-center justify-between gap-4 py-3"
      style={{ borderTop: "1px solid var(--t-line-light-2)", borderBottom: "1px solid var(--t-line-light-2)" }}
    >
      <label htmlFor={`class-share-${script.id}`} className="min-w-0">
        <span className="block text-[14px] font-semibold text-[color:var(--t-text)]">Share with my class</span>
        <span className="block text-[13px] text-[color:var(--t-muted-light)]">
          {on
            ? "Your students see it under your name in ScenePartner. Nobody else does."
            : "Only the students who joined through your class link would see it."}
        </span>
      </label>
      <Switch
        id={`class-share-${script.id}`}
        checked={on}
        disabled={share.isPending}
        onCheckedChange={(next) => {
          setPending(next);
          share.mutate(
            { scriptIds: [script.id], on: next },
            {
              onError: (e: unknown) => {
                setPending(null);
                const detail =
                  e && typeof e === "object" && "response" in e
                    ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                    : null;
                toast.error(typeof detail === "string" ? detail : "Couldn't change that. Try again.");
              },
              onSuccess: () => toast.success(next ? "Shared with your class" : "Taken off your class shelf"),
            },
          );
        }}
      />
    </div>
  );
}

export default ClassShelves;
