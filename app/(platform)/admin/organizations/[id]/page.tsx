"use client";

/**
 * One organization: who is in it, and who probably should be.
 *
 * The two suggestion lists are weak signals on purpose. Email domain finds staff
 * and anyone on a school address; the user's own typed organization finds the
 * rest. Neither can find a teacher's student who signed up on gmail and typed
 * nothing, which is exactly why attaching is a click and never automatic.
 */

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowLeft, IconPlus, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Person {
  id: number;
  email: string;
  name: string | null;
  account_type: string | null;
  typed_organization: string | null;
  joined: string | null;
  last_active: string | null;
  active_30d: boolean;
  comp_expires: string | null;
  is_staff: boolean;
}

interface Suggestion {
  id: number;
  email: string;
  name: string | null;
  why: string | null;
}

interface OrgDetail {
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
  people: Person[];
  suggestions: { by_domain: Suggestion[]; by_typed_name: Suggestion[] };
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SuggestionList({
  title, blurb, rows, onAttach, pending,
}: {
  title: string;
  blurb: string;
  rows: Suggestion[];
  onAttach: (ids: number[]) => void;
  pending: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{blurb}</p>
          </div>
          <Button size="sm" disabled={pending} onClick={() => onAttach(rows.map((r) => r.id))}>
            Attach all {rows.length}
          </Button>
        </div>
        <ul className="mt-3 space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="text-foreground">{r.name || r.email}</span>{" "}
                <span className="text-muted-foreground">{r.email}</span>
                {r.why && <span className="ml-2 text-xs text-muted-foreground">({r.why})</span>}
              </span>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => onAttach([r.id])}>
                <IconPlus className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery<OrgDetail>({
    queryKey: ["admin-organization", id],
    queryFn: async (): Promise<OrgDetail> =>
      (await api.get<OrgDetail>(`/api/admin/organizations/${id}`)).data,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-organization", id] });
    qc.invalidateQueries({ queryKey: ["admin-organizations"] });
  };

  const attach = useMutation<{ attached: number }, unknown, number[]>({
    mutationFn: async (userIds: number[]) =>
      (await api.post<{ attached: number }>(`/api/admin/organizations/${id}/members`, { user_ids: userIds })).data,
    onMutate: () => setBusy(true),
    onSettled: () => setBusy(false),
    onSuccess: (r: { attached: number }) => {
      toast.success(`Attached ${r.attached}`);
      refresh();
    },
    onError: () => toast.error("Could not attach"),
  });

  const detach = useMutation<{ ok: boolean }, unknown, number>({
    mutationFn: async (userId: number) =>
      (await api.delete<{ ok: boolean }>(`/api/admin/organizations/${id}/members/${userId}`)).data,
    onSuccess: () => {
      toast.success("Removed from organization");
      refresh();
    },
    onError: () => toast.error("Could not remove"),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/organizations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <IconArrowLeft className="h-4 w-4" /> Organizations
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{data.name}</h1>
        <p className="text-sm text-muted-foreground">
          {data.kind}
          {data.first_joined && ` · first signup ${data.first_joined.slice(0, 10)}`}
          {data.top_referral && ` · came from ${data.top_referral}`}
        </p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-6">
          <Stat label="Members" value={data.members} hint={Object.entries(data.by_type).map(([k, v]) => `${v} ${k}`).join(", ")} />
          <Stat label="Activated" value={`${data.activated} / ${data.members}`} hint="ever searched or rehearsed" />
          <Stat label="Active 30d" value={data.active_30d} />
          <Stat
            label="Comps"
            value={data.comped}
            hint={data.next_comp_expiry ? `next lapses ${data.next_comp_expiry.slice(0, 10)}` : "none granted"}
          />
        </CardContent>
      </Card>

      <SuggestionList
        title="Same email domain"
        blurb="Unattached accounts on a domain someone here already uses."
        rows={data.suggestions.by_domain}
        onAttach={(ids) => attach.mutate(ids)}
        pending={busy}
      />
      <SuggestionList
        title="Typed something like this"
        blurb="They wrote this organization on their own profile."
        rows={data.suggestions.by_typed_name}
        onAttach={(ids) => attach.mutate(ids)}
        pending={busy}
      />

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Person</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Last active</th>
                <th className="px-4 py-3 font-medium">Comp</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.people.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nobody attached yet. Use the suggestions above, or attach from a user&apos;s page.
                  </td>
                </tr>
              )}
              {data.people.map((p) => (
                <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${p.id}`} className="text-foreground hover:underline">
                      {p.name || p.email}
                    </Link>
                    <div className="text-xs text-muted-foreground">{p.email}</div>
                    {/* Staff are attachable but excluded from the counts above, so
                        say which rows are not being counted. */}
                    {p.is_staff && <span className="text-xs text-muted-foreground">not counted (staff)</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.account_type ?? "unknown"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.joined?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-3">
                    {p.last_active ? (
                      <span className={p.active_30d ? "text-foreground" : "text-muted-foreground"}>{p.last_active}</span>
                    ) : (
                      <span className="text-muted-foreground">never</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.comp_expires?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => detach.mutate(p.id)} aria-label="Remove from organization">
                      <IconX className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
