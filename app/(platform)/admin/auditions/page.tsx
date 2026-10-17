"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useMarkSeen } from "@/hooks/useMarkSeen";

/**
 * Every audition a real actor has added, newest first.
 *
 * The overview has the tracker's totals; this is the who and the what. The nav
 * badge counts auditions added since this page was last opened, so a new one
 * shows up without anyone having to run a query.
 */

type Row = {
  id: number;
  user_id: number;
  email: string;
  name: string | null;
  project: string;
  role: string | null;
  kind: string;
  status: string;
  source: string;
  when: string | null;
  tz: string;
  created_at: string | null;
  pieces: string[];
};

function day(iso: string | null, tz?: string) {
  if (!iso) return "no date";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: tz || undefined,
    });
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

export default function AdminAuditionsPage() {
  useMarkSeen("auditions");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-auditions-list"],
    queryFn: async () => (await api.get<{ auditions: Row[] }>("/api/admin/auditions/list")).data,
  });

  const now = Date.now();
  const rows = data?.auditions ?? [];

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold sm:text-xl">Auditions</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          What real actors added to the tracker. Your accounts and test accounts are left out.
        </p>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Couldn&rsquo;t load auditions.</p>}
      {!isLoading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nobody has added an audition yet.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1 pr-4">Added</th>
                <th className="py-1 pr-4">Who</th>
                <th className="py-1 pr-4">Project</th>
                <th className="py-1 pr-4">Role</th>
                <th className="py-1 pr-4">When</th>
                <th className="py-1 pr-4">Piece</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const upcoming = r.when && new Date(r.when).getTime() > now;
                return (
                  <tr key={r.id} className="border-t border-border/40 align-top">
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">{day(r.created_at)}</td>
                    <td className="py-2 pr-4">
                      <Link href={`/admin/users/${r.user_id}`} className="hover:underline">
                        {r.name || r.email}
                      </Link>
                      {r.name && <div className="text-xs text-muted-foreground">{r.email}</div>}
                    </td>
                    <td className="py-2 pr-4">
                      {r.project}
                      <div className="text-xs text-muted-foreground">
                        {r.kind.replace("_", " ")} · {r.source}
                        {r.status !== "scheduled" ? ` · ${r.status}` : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-4">{r.role || "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {day(r.when, r.tz)}
                      {upcoming && <div className="text-xs text-primary">coming up</div>}
                    </td>
                    <td className="py-2 pr-4">
                      {r.pieces.length ? (
                        r.pieces.join(", ")
                      ) : (
                        <span className="text-muted-foreground">none yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
