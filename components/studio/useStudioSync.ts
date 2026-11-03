"use client";

/**
 * Keeps the notebook in this browser and the one on the account in step.
 *
 * Signed out: nothing leaves the browser. Signed in: on arrival, fetch the
 * account's roles and merge (newest edit wins); after that, push each change
 * a moment after the actor stops typing. A failed push is retried on the next
 * change and on the next visit, because `synced` only moves when the account
 * confirms.
 */

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { emptyNotebook, type Notebook, type Role } from "@/lib/studio/notebook";
import { dirty, merge, roleFromServer, type ServerRole } from "@/lib/studio/sync";

export type SyncStatus = "local" | "loading" | "saving" | "saved" | "offline";

type PutResult = { applied: boolean; role: ServerRole };

const roleBody = (r: Role) => ({
  updated_at: r.updatedAt,
  data: { name: r.name, scene: r.scene, piece: r.piece ?? null, answers: r.answers, moments: r.moments },
});

export function useStudioSync(
  nb: Notebook | null,
  setNb: (fn: (cur: Notebook | null) => Notebook | null) => void,
): SyncStatus {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<SyncStatus>("local");
  const merged = useRef<number | null>(null); // the account we merged with
  const busy = useRef(false);
  const nbRef = useRef(nb);
  nbRef.current = nb;

  const loaded = nb !== null;

  // 1. Arrival: merge with the account.
  useEffect(() => {
    if (loading || !loaded || userId === null || merged.current === userId) return;
    let cancelled = false;
    (async () => {
      setStatus("loading");
      try {
        const { data } = await api.get<ServerRole[]>("/api/studio/roles", { timeoutMs: 15000 });
        if (cancelled) return;
        const cur = nbRef.current;
        if (!cur) return;
        // Someone else's notebook in this browser stays out of this account.
        const local = cur.owner !== undefined && cur.owner !== userId ? emptyNotebook() : cur;
        const m = merge(local, data);
        merged.current = userId;
        setNb(() => ({ ...m.nb, owner: userId }));
        await Promise.all(
          m.remove.map((d) => api.delete(`/api/studio/roles/${encodeURIComponent(d.id)}?updated_at=${d.at}`)),
        );
        if (m.remove.length)
          setNb((c) => {
            if (!c) return c;
            const deleted = { ...(c.deleted ?? {}) };
            m.remove.forEach((d) => delete deleted[d.id]);
            return { ...c, deleted };
          });
        setStatus(m.push.length ? "saving" : "saved");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, loaded, userId, setNb]);

  // 2. After that: push what changed, a moment after the last keystroke.
  useEffect(() => {
    if (!nb || userId === null || merged.current !== userId) return;
    const toPush = dirty(nb);
    const toDelete = Object.entries(nb.deleted ?? {});
    if (!toPush.length && !toDelete.length) return;
    const t = window.setTimeout(async () => {
      if (busy.current) return;
      busy.current = true;
      setStatus("saving");
      try {
        const confirmed: Record<string, number> = {};
        const replaced: Role[] = [];
        for (const r of toPush) {
          const { data } = await api.put<PutResult>(`/api/studio/roles/${encodeURIComponent(r.id)}`, roleBody(r));
          confirmed[r.id] = data.role.updated_at;
          if (!data.applied && !data.role.deleted) {
            // Another device saved something newer; take theirs.
            const theirs = roleFromServer(data.role);
            if (theirs) replaced.push(theirs);
          }
        }
        for (const [id, at] of toDelete) {
          await api.delete(`/api/studio/roles/${encodeURIComponent(id)}?updated_at=${at}`);
        }
        setNb((c) => {
          if (!c) return c;
          const deleted = { ...(c.deleted ?? {}) };
          toDelete.forEach(([id]) => delete deleted[id]);
          const roles = c.roles.map((r) => replaced.find((x) => x.id === r.id) ?? r);
          return { ...c, roles, deleted, synced: { ...(c.synced ?? {}), ...confirmed } };
        });
        setStatus("saved");
      } catch {
        setStatus("offline");
      } finally {
        busy.current = false;
      }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [nb, userId, setNb]);

  if (loading) return "loading";
  if (userId === null) return "local";
  return status;
}
