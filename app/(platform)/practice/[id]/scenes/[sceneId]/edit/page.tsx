import { redirect } from "next/navigation";

/**
 * Retired 2026-09-24. The scene page is the editor now.
 *
 * This was 4,018 lines holding four jobs: line editing, cast and voices,
 * rehearsal settings, and a launcher. The numbers retired it. 36 people opened
 * it and 4 changed anything — 32 of 36 edit snapshots are identical to the
 * scene as extracted. They were not repairing scripts, they were READING them,
 * because the scene page showed six lines and this was the only place the rest
 * of the script existed. The scene page shows the whole scene now, and a line
 * is fixed where it is read.
 *
 * Its other jobs went home: rehearsal settings already existed on the rehearsal
 * screen with their own defaults (this held a second copy), and per-line emotion
 * was set on 0 of 894 lines.
 *
 * A redirect, not a 404: the route is in browser histories and in the wild.
 */
export default async function RetiredSceneEditor({
  params,
}: {
  params: Promise<{ id: string; sceneId: string }>;
}) {
  const { id, sceneId } = await params;
  redirect(`/practice/${id}/scenes/${sceneId}`);
}
