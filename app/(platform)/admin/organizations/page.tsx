"use client";

/**
 * Organizations: which schools, studios and chapters are actually using this.
 *
 * Sorted by nearest comp expiry, so the page opens as a worklist rather than a
 * directory. The one action this data enables is "that class lapses soon, write
 * to their teacher", and a list sorted by name would bury it.
 */

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBuilding, IconPlus, IconRefresh } from "@tabler/icons-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface OrganizationRow {
  id: number;
  name: string;
  kind: string;
  notes: string | null;
  members: number;
  by_type: Record<string, number>;
  activated: number;
  active_30d: number;
  comped: number;
  next_comp_expiry: string | null;
  first_joined: string | null;
  top_referral: string | null;
}

const KINDS = ["school", "studio", "chapter", "company"];

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/** Expiry read as urgency, not as a date. "in 6 days" is the actionable form. */
function ExpiryCell({ iso }: { iso: string | null }) {
  const days = daysUntil(iso);
  if (days === null) return <span className="text-muted-foreground">no comps</span>;
  if (days < 0) return <span className="text-destructive font-medium">lapsed</span>;
  if (days <= 14) return <span className="text-destructive font-medium">in {days}d</span>;
  return <span className="text-foreground">in {days}d</span>;
}

export default function AdminOrganizationsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("school");

  type OrgListResponse = { organizations: OrganizationRow[]; total: number };

  const { data, isLoading, refetch, isFetching } = useQuery<OrgListResponse>({
    queryKey: ["admin-organizations"],
    queryFn: async (): Promise<OrgListResponse> =>
      (await api.get<OrgListResponse>("/api/admin/organizations")).data,
  });

  const create = useMutation<OrganizationRow, unknown, void>({
    mutationFn: async () =>
      (await api.post<OrganizationRow>("/api/admin/organizations", { name, kind })).data,
    onSuccess: (org: OrganizationRow) => {
      toast.success(`Added ${org.name}`);
      setName("");
      qc.invalidateQueries({ queryKey: ["admin-organizations"] });
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Could not add that organization");
    },
  });

  const orgs = data?.organizations ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <IconBuilding className="h-6 w-6" />
            Organizations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Soonest comp expiry first. Staff accounts are excluded from every number.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <IconRefresh className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Northern Michigan University"
            className="max-w-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) create.mutate();
            }}
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            <IconPlus className="h-4 w-4 mr-1" />
            Add
          </Button>
          <p className="text-xs text-muted-foreground basis-full">
            Add the organization first, then attach people from its page. Nothing is
            attached automatically.
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : orgs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No organizations yet. Add one above, then attach its people.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Organization</th>
                  <th className="px-4 py-3 font-medium">Members</th>
                  <th className="px-4 py-3 font-medium">Activated</th>
                  <th className="px-4 py-3 font-medium">Active 30d</th>
                  <th className="px-4 py-3 font-medium">Comps</th>
                  <th className="px-4 py-3 font-medium">Expiry</th>
                  <th className="px-4 py-3 font-medium">Came from</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/admin/organizations/${o.id}`} className="font-medium text-foreground hover:underline">
                        {o.name}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{o.kind}</span>
                    </td>
                    <td className="px-4 py-3">{o.members}</td>
                    {/* Activated against members is the alive-or-dead read: 7 of 7
                        is a working class, 0 of 7 is a listing that did nothing. */}
                    <td className="px-4 py-3">
                      {o.activated}
                      <span className="text-muted-foreground"> / {o.members}</span>
                    </td>
                    <td className="px-4 py-3">{o.active_30d}</td>
                    <td className="px-4 py-3">{o.comped || <span className="text-muted-foreground">0</span>}</td>
                    <td className="px-4 py-3"><ExpiryCell iso={o.next_comp_expiry} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{o.top_referral ?? "unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
