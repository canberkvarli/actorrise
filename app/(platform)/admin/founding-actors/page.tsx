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
  IconExternalLink,
  IconLoader2,
  IconSearch,
} from "@tabler/icons-react";
import Link from "next/link";
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
  const [editingActorId, setEditingActorId] = useState<number | null>(null);

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
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg md:text-xl font-semibold text-foreground">Founding Actors</h2>
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
            className="min-h-[44px] sm:min-h-0 flex-1 sm:flex-none"
          >
            <IconRefresh className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="min-h-[44px] sm:min-h-0 flex-1 sm:flex-none"
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
                <CardContent className="py-3 px-3 sm:py-4 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
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
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground break-words">{actor.name}</span>
                        <Badge variant={actor.is_published ? "default" : "secondary"} className="text-xs">
                          {actor.is_published ? "Published" : "Draft"}
                        </Badge>
                        {actor.user_id && (
                          <Badge variant="outline" className="text-xs">
                            User #{actor.user_id}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="break-all">/actors/{actor.slug}</span>
                        <span>·</span>
                        <span>Order: {actor.display_order}</span>
                        <span>·</span>
                        <span>{actor.headshots.length} headshot{actor.headshots.length !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-1 shrink-0 sm:flex-nowrap">
                    <Button
                      variant={editingActorId === actor.id ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setEditingActorId(editingActorId === actor.id ? null : actor.id)}
                      title="Edit profile"
                      className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                    >
                      <IconEdit className="h-4 w-4" />
                    </Button>
                    <Link
                      href={`/actors/${actor.slug}`}
                      target="_blank"
                      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:h-8 sm:w-8 sm:min-h-0 sm:min-w-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="View public page"
                    >
                      <IconExternalLink className="h-4 w-4" />
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTogglePublished(actor)}
                      title={actor.is_published ? "Unpublish" : "Publish"}
                      className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
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
                        className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                      >
                        <IconLink className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(actor)}
                      title="Delete"
                      className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-destructive hover:text-destructive"
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
                {editingActorId === actor.id && (
                  <EditFoundingActorPanel
                    actor={actor}
                    onSaved={() => {
                      setEditingActorId(null);
                      queryClient.invalidateQueries({ queryKey: ["admin-founding-actors"] });
                      queryClient.invalidateQueries({ queryKey: ["founding-actors"] });
                    }}
                    onCancel={() => setEditingActorId(null)}
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
    <div className="border-t border-border/40 px-3 sm:px-5 py-4 bg-muted/30">
      <div className="flex items-center gap-2 mb-3">
        <IconSearch className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search users by name or email..."
          className="h-9 sm:h-8 text-sm flex-1 min-w-0"
        />
        <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0 text-xs min-h-[44px] sm:min-h-0">
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
              className="w-full flex flex-wrap items-center gap-2 sm:gap-3 px-3 py-2 min-h-[44px] sm:min-h-0 rounded-md text-left text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Badge variant="outline" className="text-xs font-mono shrink-0">
                #{u.id}
              </Badge>
              <span className="font-medium text-foreground truncate">
                {u.profile_name || u.name || "-"}
              </span>
              <span className="text-xs text-muted-foreground truncate sm:ml-auto break-all">
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
        <CardTitle className="text-base sm:text-lg">New Founding Actor</CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 md:p-6">
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
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-descriptor">Descriptor</Label>
              <Input
                id="new-descriptor"
                value={descriptor}
                onChange={(e) => setDescriptor(e.target.value)}
                placeholder="Actor · Voice Actor"
                className="w-full"
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
              className="w-full"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="submit" disabled={saving} className="min-h-[44px] sm:min-h-0 w-full sm:w-auto">
              {saving && <IconLoader2 className="h-4 w-4 animate-spin mr-2" />}
              Create
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} className="min-h-[44px] sm:min-h-0 w-full sm:w-auto">
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


function EditFoundingActorPanel({
  actor,
  onSaved,
  onCancel,
}: {
  actor: AdminFoundingActor;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(actor.name);
  const [descriptor, setDescriptor] = useState(actor.descriptor || "");
  const [bio, setBio] = useState(actor.bio || "");
  const [quote, setQuote] = useState(actor.quote || "");
  const [displayOrder, setDisplayOrder] = useState(actor.display_order);
  const [imdb, setImdb] = useState(actor.social_links.imdb || "");
  const [website, setWebsite] = useState(actor.social_links.website || "");
  const [instagram, setInstagram] = useState(actor.social_links.instagram || "");
  const [x, setX] = useState(actor.social_links.x || "");
  const [saving, setSaving] = useState(false);
  const [headshots, setHeadshots] = useState(actor.headshots);
  const [uploading, setUploading] = useState(false);

  const handleHeadshotUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data } = await api.post<AdminFoundingActor>(
        `/api/admin/founding-actors/${actor.id}/headshots`,
        { image_base64: base64, is_primary: headshots.length === 0 }
      );
      setHeadshots(data.headshots);
      toast.success("Headshot uploaded");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Upload failed";
      toast.error(detail);
    } finally {
      setUploading(false);
    }
  };

  const handleHeadshotDelete = async (index: number) => {
    if (!confirm("Delete this headshot?")) return;
    try {
      const { data } = await api.delete<AdminFoundingActor>(
        `/api/admin/founding-actors/${actor.id}/headshots/${index}`
      );
      setHeadshots(data.headshots);
      toast.success("Headshot deleted");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Delete failed";
      toast.error(detail);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const socialLinks: Record<string, string> = {};
      if (imdb.trim()) socialLinks.imdb = imdb.trim();
      if (website.trim()) socialLinks.website = website.trim();
      if (instagram.trim()) socialLinks.instagram = instagram.trim();
      if (x.trim()) socialLinks.x = x.trim();

      await api.patch(`/api/admin/founding-actors/${actor.id}`, {
        name: name.trim(),
        descriptor: descriptor.trim() || null,
        bio: bio.trim() || null,
        quote: quote.trim() || null,
        display_order: displayOrder,
        social_links: socialLinks,
      });
      toast.success(`${name} updated`);
      onSaved();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to update";
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-border/40 px-3 sm:px-5 py-4 sm:py-5 bg-muted/30 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Edit {actor.name}</p>
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-xs min-h-[44px] sm:min-h-0">
          Cancel
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`edit-name-${actor.id}`} className="text-xs">Name *</Label>
          <Input
            id={`edit-name-${actor.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`edit-descriptor-${actor.id}`} className="text-xs">Descriptor</Label>
          <Input
            id={`edit-descriptor-${actor.id}`}
            value={descriptor}
            onChange={(e) => setDescriptor(e.target.value)}
            placeholder="Actor · Voice Actor"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`edit-order-${actor.id}`} className="text-xs">Display Order</Label>
          <Input
            id={`edit-order-${actor.id}`}
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(Number(e.target.value))}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`edit-quote-${actor.id}`} className="text-xs">Quote</Label>
        <Textarea
          id={`edit-quote-${actor.id}`}
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          placeholder="Testimonial quote..."
          rows={3}
          className="text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`edit-bio-${actor.id}`} className="text-xs">Bio</Label>
        <Textarea
          id={`edit-bio-${actor.id}`}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Bio text..."
          rows={4}
          className="text-sm"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`edit-imdb-${actor.id}`} className="text-xs">IMDb URL</Label>
          <Input
            id={`edit-imdb-${actor.id}`}
            value={imdb}
            onChange={(e) => setImdb(e.target.value)}
            placeholder="https://www.imdb.com/name/nm..."
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`edit-website-${actor.id}`} className="text-xs">Website</Label>
          <Input
            id={`edit-website-${actor.id}`}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://..."
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`edit-instagram-${actor.id}`} className="text-xs">Instagram</Label>
          <Input
            id={`edit-instagram-${actor.id}`}
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="@username"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`edit-x-${actor.id}`} className="text-xs">X / Twitter</Label>
          <Input
            id={`edit-x-${actor.id}`}
            value={x}
            onChange={(e) => setX(e.target.value)}
            placeholder="@username"
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="space-y-2 pt-3 border-t border-border/40">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Headshots</Label>
          <span className="text-[10px] text-muted-foreground">{headshots.length}/3</span>
        </div>
        {headshots.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {headshots.map((h, i) => (
              <div key={`${h.url}-${i}`} className="relative w-20 h-20 overflow-hidden border border-border rounded">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={h.url} alt={h.caption || `headshot ${i + 1}`} className="w-full h-full object-cover" />
                {h.is_primary && (
                  <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[9px] px-1 rounded">primary</span>
                )}
                <button
                  type="button"
                  onClick={() => handleHeadshotDelete(i)}
                  className="absolute top-0 right-0 bg-black/60 text-white text-[11px] leading-none px-1.5 py-0.5 hover:bg-destructive"
                  aria-label="Delete headshot"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {headshots.length < 3 && (
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleHeadshotUpload(file);
              e.target.value = "";
            }}
            disabled={uploading}
            className="h-8 text-xs cursor-pointer"
          />
        )}
        {uploading && <p className="text-xs text-muted-foreground">Uploading...</p>}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving} className="min-h-[44px] sm:min-h-0 w-full sm:w-auto">
          {saving && <IconLoader2 className="h-4 w-4 animate-spin mr-1" />}
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="min-h-[44px] sm:min-h-0 w-full sm:w-auto">
          Cancel
        </Button>
      </div>
    </div>
  );
}
