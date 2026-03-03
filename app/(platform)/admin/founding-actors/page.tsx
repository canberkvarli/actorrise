"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  IconPlus,
  IconRefresh,
  IconTrash,
  IconEdit,
  IconLink,
  IconEye,
  IconEyeOff,
  IconLoader2,
  IconSearch,
} from "@tabler/icons-react";
import Image from "next/image";

interface AdminFoundingActor {
  id: number;
  user_id: number | null;
  name: string;
  slug: string;
  descriptor: string | null;
  bio: string | null;
  quote: string | null;
  social_links: Record<string, string>;
  headshots: { url: string; is_primary?: boolean; caption?: string }[];
  display_order: number;
  is_published: boolean;
  source: string | null;
}

export default function AdminFoundingActorsPage() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [linkingActorId, setLinkingActorId] = useState<number | null>(null);

  const { data: actors, isLoading, refetch, isFetching } = useQuery<AdminFoundingActor[]>({
    queryKey: ["admin-founding-actors"],
    queryFn: async () => {
      const res = await api.get<AdminFoundingActor[]>("/api/admin/founding-actors");
      return res.data;
    },
  });

  const handleTogglePublished = async (actor: AdminFoundingActor) => {
    try {
      await api.patch(`/api/admin/founding-actors/${actor.id}`, {
        is_published: !actor.is_published,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-founding-actors"] });
      queryClient.invalidateQueries({ queryKey: ["founding-actors"] });
      toast.success(
        actor.is_published ? `${actor.name} unpublished` : `${actor.name} published`,
      );
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async (actor: AdminFoundingActor) => {
    if (!confirm(`Delete ${actor.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/admin/founding-actors/${actor.id}`);
      queryClient.invalidateQueries({ queryKey: ["admin-founding-actors"] });
      queryClient.invalidateQueries({ queryKey: ["founding-actors"] });
      toast.success(`${actor.name} deleted`);
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleLinkUser = async (actorId: number, userId: number) => {
    try {
      await api.post(`/api/admin/founding-actors/${actorId}/link-user`, {
        user_id: userId,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-founding-actors"] });
      setLinkingActorId(null);
      toast.success("User linked");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to link user";
      toast.error(detail);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Founding Actors</h2>
          <p className="text-sm text-muted-foreground">
            Manage founding actor profiles shown on the homepage and /actors page.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <IconRefresh className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <IconPlus className="h-4 w-4 mr-1" />
            Add Actor
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <CreateFoundingActorForm
          onCreated={() => {
            setShowCreateForm(false);
            queryClient.invalidateQueries({ queryKey: ["admin-founding-actors"] });
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : !actors || actors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No founding actors yet. Click &ldquo;Add Actor&rdquo; to create one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {actors.map((actor) => {
            const primary = actor.headshots.find((h) => h.is_primary) || actor.headshots[0];
            return (
              <Card key={actor.id}>
                <CardContent className="py-4 px-5 flex items-center gap-4">
                  {/* Thumbnail */}
                  {primary ? (
                    <div className="relative w-12 h-15 rounded-md overflow-hidden shrink-0 bg-muted">
                      <Image
                        src={primary.url}
                        alt={actor.name}
                        width={48}
                        height={60}
                        className="object-cover object-top w-full h-full"
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-15 rounded-md bg-muted flex items-center justify-center shrink-0 text-muted-foreground text-xs font-bold">
                      {actor.name.split(" ").map(w => w[0]).join("")}
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{actor.name}</span>
                      <Badge variant={actor.is_published ? "default" : "secondary"} className="text-xs">
                        {actor.is_published ? "Published" : "Draft"}
                      </Badge>
                      {actor.user_id && (
                        <Badge variant="outline" className="text-xs">
                          User #{actor.user_id}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                      <span>/actors/{actor.slug}</span>
                      <span>Order: {actor.display_order}</span>
                      <span>{actor.headshots.length} headshot{actor.headshots.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTogglePublished(actor)}
                      title={actor.is_published ? "Unpublish" : "Publish"}
                    >
                      {actor.is_published ? (
                        <IconEyeOff className="h-4 w-4" />
                      ) : (
                        <IconEye className="h-4 w-4" />
                      )}
                    </Button>
                    {!actor.user_id && (
                      <Button
                        variant={linkingActorId === actor.id ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setLinkingActorId(linkingActorId === actor.id ? null : actor.id)}
                        title="Link user account"
                      >
                        <IconLink className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(actor)}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
                {linkingActorId === actor.id && (
                  <UserSearchPanel
                    onSelect={(userId) => handleLinkUser(actor.id, userId)}
                    onCancel={() => setLinkingActorId(null)}
                  />
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


interface UserSearchResult {
  id: number;
  email: string;
  name: string | null;
  profile_name: string | null;
}

function UserSearchPanel({
  onSelect,
  onCancel,
}: {
  onSelect: (userId: number) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const [linking, setLinking] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-search", q],
    queryFn: async () => {
      if (!q.trim()) return { items: [] };
      const res = await api.get<{ items: UserSearchResult[] }>(
        `/api/admin/users?q=${encodeURIComponent(q.trim())}&limit=8`,
      );
      return res.data;
    },
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });

  const results = data?.items ?? [];

  const handleSelect = async (userId: number) => {
    setLinking(true);
    await onSelect(userId);
    setLinking(false);
  };

  return (
    <div className="border-t border-border/40 px-5 py-4 bg-muted/30">
      <div className="flex items-center gap-2 mb-3">
        <IconSearch className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search users by name or email..."
          className="h-8 text-sm"
        />
        <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0 text-xs">
          Cancel
        </Button>
      </div>

      {isLoading && q.trim().length >= 2 && (
        <p className="text-xs text-muted-foreground py-2">Searching...</p>
      )}

      {!isLoading && q.trim().length >= 2 && results.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">No users found for &ldquo;{q}&rdquo;</p>
      )}

      {results.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              disabled={linking}
              onClick={() => handleSelect(u.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Badge variant="outline" className="text-xs font-mono shrink-0">
                #{u.id}
              </Badge>
              <span className="font-medium text-foreground truncate">
                {u.profile_name || u.name || "—"}
              </span>
              <span className="text-xs text-muted-foreground truncate ml-auto">
                {u.email}
              </span>
            </button>
          ))}
        </div>
      )}

      {q.trim().length < 2 && (
        <p className="text-xs text-muted-foreground py-1">Type at least 2 characters to search</p>
      )}
    </div>
  );
}


function CreateFoundingActorForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [descriptor, setDescriptor] = useState("");
  const [quote, setQuote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/admin/founding-actors", {
        name: name.trim(),
        descriptor: descriptor.trim() || null,
        quote: quote.trim() || null,
        is_published: false,
      });
      toast.success(`${name} created`);
      onCreated();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to create";
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New Founding Actor</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Name *</Label>
              <Input
                id="new-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-descriptor">Descriptor</Label>
              <Input
                id="new-descriptor"
                value={descriptor}
                onChange={(e) => setDescriptor(e.target.value)}
                placeholder="Actor · Voice Actor"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-quote">Quote</Label>
            <Textarea
              id="new-quote"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              placeholder="Testimonial quote..."
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving && <IconLoader2 className="h-4 w-4 animate-spin mr-2" />}
              Create
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
