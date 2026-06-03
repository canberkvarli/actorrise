"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { IconSearch, IconRefresh } from "@tabler/icons-react";

import api from "@/lib/api";
import { AdminUsersListResponse } from "@/types/adminUsers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 25;

function getTierBadgeClass(tierName: string): string {
  const name = tierName.toLowerCase();
  if (name === "free") return "bg-slate-100 text-slate-700 border-slate-300 rounded-none";
  if (name === "plus" || name === "pro") return "bg-amber-100 text-amber-800 border-amber-300 rounded-none";
  if (name === "unlimited" || name === "elite") return "bg-violet-100 text-violet-800 border-violet-300 rounded-none";
  return "bg-muted text-foreground border-border rounded-none";
}

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "moderator" | "member">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (roleFilter === "moderator") params.set("is_moderator", "true");
    if (roleFilter === "member") params.set("is_moderator", "false");
    if (statusFilter !== "all") params.set("subscription_status", statusFilter);
    params.set("sort_by", sortBy);
    params.set("sort_order", sortOrder);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    return params.toString();
  }, [offset, q, roleFilter, sortBy, sortOrder, statusFilter]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-users-list", queryParams],
    queryFn: async () => {
      const res = await api.get<AdminUsersListResponse>(`/api/admin/users?${queryParams}`);
      return res.data;
    },
  });

  const total = data?.total ?? 0;
  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 md:p-6">
          <CardTitle className="text-base sm:text-lg md:text-xl">Users</CardTitle>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 min-h-[44px] sm:min-h-0 w-full sm:w-auto"
              onClick={() => refetch()}
            >
              <IconRefresh className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4 md:p-6 pt-0">
          <div className="flex flex-wrap gap-2">
            <div className="relative w-full sm:w-64">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setOffset(0);
                  setQ(e.target.value);
                }}
                className="pl-9 w-full"
                placeholder="Search email or name..."
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => {
                setOffset(0);
                setRoleFilter(e.target.value as "all" | "moderator" | "member");
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full sm:w-auto"
            >
              <option value="all">All roles</option>
              <option value="moderator">Moderators</option>
              <option value="member">Members</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setOffset(0);
                setStatusFilter(e.target.value);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full sm:w-auto"
            >
              <option value="all">All subscription statuses</option>
              <option value="active">active</option>
              <option value="trialing">trialing</option>
              <option value="canceled">canceled</option>
              <option value="past_due">past_due</option>
              <option value="unpaid">unpaid</option>
              <option value="incomplete">incomplete</option>
            </select>
            <div className="flex gap-2 w-full sm:w-auto">
              <select
                value={sortBy}
                onChange={(e) => {
                  setOffset(0);
                  setSortBy(e.target.value);
                }}
                className="flex-1 sm:flex-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="created_at">Created</option>
                <option value="email">Email</option>
                <option value="name">Name</option>
                <option value="tier_name">Tier</option>
                <option value="subscription_status">Sub status</option>
              </select>
              <select
                value={sortOrder}
                onChange={(e) => {
                  setOffset(0);
                  setSortOrder(e.target.value as "asc" | "desc");
                }}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 sm:p-4 md:p-6 pt-6">
          {isLoading ? (
            <p className="py-8 text-center text-muted-foreground">Loading users...</p>
          ) : isError ? (
            <p className="py-8 text-center text-destructive">
              {(error as Error)?.message || "Failed to load users"}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="md:hidden space-y-3">
                {data?.items.map((item) => (
                  <div
                    key={item.id}
                    className="border border-border/60 bg-card p-3 space-y-2"
                  >
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm break-all">{item.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.name || item.profile_name || "Unnamed user"}
                        {item.created_at ? ` · ${new Date(item.created_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className={getTierBadgeClass(item.tier_name)}>
                        {item.tier_display_name}
                      </Badge>
                      <Badge variant="outline" className="rounded-none">
                        {item.subscription_status}
                      </Badge>
                      {!item.is_moderator && !item.can_approve_submissions && (
                        <Badge variant="secondary" className="rounded-none">Member</Badge>
                      )}
                      {item.is_moderator && (
                        <Badge variant="default" className="rounded-none">Moderator</Badge>
                      )}
                      {item.can_approve_submissions && (
                        <Badge variant="secondary" className="rounded-none">Approver</Badge>
                      )}
                    </div>
                    <div className="pt-1">
                      <Button asChild size="sm" variant="outline" className="w-full min-h-[44px]">
                        <Link href={`/admin/users/${item.id}`}>Open</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 text-left font-medium">User</th>
                      <th className="py-2 text-left font-medium">Tier</th>
                      <th className="py-2 text-left font-medium">Subscription</th>
                      <th className="py-2 text-left font-medium">Roles</th>
                      <th className="py-2 text-left font-medium">Created</th>
                      <th className="py-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.map((item) => (
                      <tr key={item.id} className="border-b border-border/60 hover:bg-muted/30">
                        <td className="py-2">
                          <p className="font-medium">{item.name || item.profile_name || "Unnamed user"}</p>
                          <p className="text-xs text-muted-foreground">{item.email}</p>
                        </td>
                        <td className="py-2">
                          <Badge variant="outline" className={getTierBadgeClass(item.tier_name)}>
                            {item.tier_display_name}
                          </Badge>
                        </td>
                        <td className="py-2">
                          <Badge variant="outline" className="rounded-none">{item.subscription_status}</Badge>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {!item.is_moderator && !item.can_approve_submissions && (
                              <Badge variant="secondary" className="rounded-none">Member</Badge>
                            )}
                            {item.is_moderator && <Badge variant="default" className="rounded-none">Moderator</Badge>}
                            {item.can_approve_submissions && <Badge variant="secondary" className="rounded-none">Approver</Badge>}
                          </div>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : "-"}
                        </td>
                        <td className="py-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/users/${item.id}`}>Open</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                <p className="text-sm text-muted-foreground text-center sm:text-left">
                  {total === 0 ? "No users found" : `Showing ${pageStart}-${pageEnd} of ${total}`}
                </p>
                <div className="flex gap-2 justify-center sm:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] sm:min-h-0 flex-1 sm:flex-none"
                    disabled={!canPrev}
                    onClick={() => setOffset((v) => Math.max(0, v - PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] sm:min-h-0 flex-1 sm:flex-none"
                    disabled={!canNext}
                    onClick={() => setOffset((v) => v + PAGE_SIZE)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
