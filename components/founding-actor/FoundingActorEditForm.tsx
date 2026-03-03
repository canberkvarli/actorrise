"use client";

import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HeadshotGallery } from "./HeadshotGallery";
import { SocialLinkIcons } from "./SocialLinkIcons";
import { PhotoEditor } from "@/components/profile/PhotoEditor";
import type { FoundingActorPublic } from "@/hooks/useFoundingActors";
import {
  IconPhoto,
  IconUser,
  IconLink,
  IconEye,
  IconUpload,
  IconTrash,
  IconStar,
  IconLoader2,
} from "@tabler/icons-react";
import Image from "next/image";

interface FoundingActorEditFormProps {
  actor: FoundingActorPublic;
}

export function FoundingActorEditForm({ actor }: FoundingActorEditFormProps) {
  const queryClient = useQueryClient();

  // Form state
  const [bio, setBio] = useState(actor.bio || "");
  const [descriptor, setDescriptor] = useState(actor.descriptor || "");
  const [quote, setQuote] = useState(actor.quote || "");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(
    actor.social_links || {},
  );
  const [headshots, setHeadshots] = useState(actor.headshots || []);
  const [saving, setSaving] = useState(false);

  // Photo editor state
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const [uploadingHeadshot, setUploadingHeadshot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSocialLinkChange = (key: string, value: string) => {
    setSocialLinks((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put<FoundingActorPublic>("/api/founding-actors/me", {
        bio: bio || null,
        descriptor: descriptor || null,
        quote: quote || null,
        social_links: socialLinks,
      });
      queryClient.invalidateQueries({ queryKey: ["founding-actors"] });
      toast.success(
        "Thank you for your updates! Your page is now live.",
        { duration: 5000 },
      );
    } catch (err) {
      toast.error("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEditingImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleHeadshotSave = async (croppedImage: string) => {
    setUploadingHeadshot(true);
    try {
      const res = await api.post<FoundingActorPublic>(
        "/api/founding-actors/me/headshots",
        { image: croppedImage },
      );
      setHeadshots(res.data.headshots);
      setEditingImage(null);
      queryClient.invalidateQueries({ queryKey: ["founding-actors"] });
      toast.success("Headshot uploaded!");
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Failed to upload headshot.";
      toast.error(detail);
    } finally {
      setUploadingHeadshot(false);
    }
  };

  const handleDeleteHeadshot = async (index: number) => {
    try {
      const res = await api.delete<FoundingActorPublic>(
        `/api/founding-actors/me/headshots/${index}`,
      );
      setHeadshots(res.data.headshots);
      queryClient.invalidateQueries({ queryKey: ["founding-actors"] });
      toast.success("Headshot removed.");
    } catch {
      toast.error("Failed to remove headshot.");
    }
  };

  const handleSetPrimary = async (index: number) => {
    try {
      const res = await api.put<FoundingActorPublic>(
        "/api/founding-actors/me/headshots/primary",
        { index },
      );
      setHeadshots(res.data.headshots);
      queryClient.invalidateQueries({ queryKey: ["founding-actors"] });
      toast.success("Primary headshot updated.");
    } catch {
      toast.error("Failed to update primary headshot.");
    }
  };

  // Photo editor overlay
  if (editingImage) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Crop your headshot. Portrait orientation (4:5) works best.
        </p>
        <PhotoEditor
          image={editingImage}
          onSave={handleHeadshotSave}
          onCancel={() => setEditingImage(null)}
          aspectRatio={4 / 5}
        />
      </div>
    );
  }

  return (
    <Tabs defaultValue="bio" className="space-y-6">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="bio" className="gap-1.5">
          <IconUser className="h-4 w-4" />
          <span className="hidden sm:inline">Bio</span>
        </TabsTrigger>
        <TabsTrigger value="headshots" className="gap-1.5">
          <IconPhoto className="h-4 w-4" />
          <span className="hidden sm:inline">Headshots</span>
        </TabsTrigger>
        <TabsTrigger value="social" className="gap-1.5">
          <IconLink className="h-4 w-4" />
          <span className="hidden sm:inline">Links</span>
        </TabsTrigger>
        <TabsTrigger value="preview" className="gap-1.5">
          <IconEye className="h-4 w-4" />
          <span className="hidden sm:inline">Preview</span>
        </TabsTrigger>
      </TabsList>

      {/* Bio & Details */}
      <TabsContent value="bio" className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="descriptor">Title / Descriptor</Label>
          <Input
            id="descriptor"
            value={descriptor}
            onChange={(e) => setDescriptor(e.target.value)}
            placeholder="e.g. Actor · Voice Actor · Comedian"
          />
          <p className="text-xs text-muted-foreground">
            Shown below your name on the homepage and your actor page.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quote">Testimonial Quote</Label>
          <Textarea
            id="quote"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder="What would you like to say about ActorRise?"
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            {quote.length} characters. Shorter quotes (under 260 chars) display best on the homepage.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about yourself, your acting journey, and what drives you..."
            rows={8}
          />
          <p className="text-xs text-muted-foreground">
            Shown on your dedicated actor page. Write in first or third person.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving && <IconLoader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Changes
        </Button>
      </TabsContent>

      {/* Headshots */}
      <TabsContent value="headshots" className="space-y-5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="space-y-2">
          <Label>Your Headshots ({headshots.length}/3)</Label>
          <p className="text-xs text-muted-foreground">
            Upload up to 3 headshots. Portrait orientation recommended. The primary headshot is shown on the homepage.
          </p>
        </div>

        {headshots.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {headshots.map((h, i) => (
              <div
                key={i}
                className="relative group rounded-lg overflow-hidden border border-border/60 bg-muted"
              >
                <div className="relative aspect-[4/5]">
                  <Image
                    src={h.url}
                    alt={`Headshot ${i + 1}`}
                    fill
                    className="object-cover object-top"
                    sizes="(max-width: 640px) 100vw, 33vw"
                  />
                </div>
                {h.is_primary && (
                  <span className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full font-medium">
                    Primary
                  </span>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2 flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  {!h.is_primary && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      onClick={() => handleSetPrimary(i)}
                    >
                      <IconStar className="h-3 w-3 mr-1" />
                      Primary
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    onClick={() => handleDeleteHeadshot(i)}
                  >
                    <IconTrash className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-border/60 bg-muted/20 p-8 text-center">
            <IconPhoto className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No headshots uploaded yet</p>
          </div>
        )}

        {headshots.length < 3 && (
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <IconUpload className="h-4 w-4 mr-2" />
            Upload Headshot
          </Button>
        )}
      </TabsContent>

      {/* Social Links */}
      <TabsContent value="social" className="space-y-5">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="social-imdb">IMDb URL</Label>
            <Input
              id="social-imdb"
              value={socialLinks.imdb || ""}
              onChange={(e) => handleSocialLinkChange("imdb", e.target.value)}
              placeholder="https://www.imdb.com/name/nm..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="social-website">Website</Label>
            <Input
              id="social-website"
              value={socialLinks.website || ""}
              onChange={(e) => handleSocialLinkChange("website", e.target.value)}
              placeholder="https://yourwebsite.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="social-instagram">Instagram</Label>
            <Input
              id="social-instagram"
              value={socialLinks.instagram || ""}
              onChange={(e) => handleSocialLinkChange("instagram", e.target.value)}
              placeholder="@yourusername"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="social-x">X / Twitter</Label>
            <Input
              id="social-x"
              value={socialLinks.x || ""}
              onChange={(e) => handleSocialLinkChange("x", e.target.value)}
              placeholder="@yourusername"
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving && <IconLoader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Changes
        </Button>
      </TabsContent>

      {/* Preview */}
      <TabsContent value="preview" className="space-y-5">
        <p className="text-sm text-muted-foreground">
          This is how your page will appear to visitors at{" "}
          <span className="font-mono text-xs">/actors/{actor.slug}</span>.
        </p>

        <div className="rounded-xl border border-border/60 bg-card p-6 sm:p-8">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
            {/* Headshot preview */}
            {headshots.length > 0 && (
              <HeadshotGallery
                headshots={headshots}
                name={actor.name}
              />
            )}

            <div>
              <h2 className="text-2xl font-bold text-foreground font-brand">
                {actor.name}
              </h2>
              {descriptor && (
                <p className="text-muted-foreground mt-0.5">{descriptor}</p>
              )}
              <SocialLinkIcons
                socialLinks={socialLinks}
                className="mt-2"
                iconSize="h-5 w-5"
              />
              {bio && (
                <p className="mt-4 text-foreground/90 leading-relaxed whitespace-pre-line text-sm">
                  {bio}
                </p>
              )}
              {quote && (
                <div className="mt-6 relative rounded-lg border border-border/60 bg-background p-4">
                  <span className="absolute top-2 left-3 text-3xl font-serif text-muted-foreground/30 leading-none select-none" aria-hidden>
                    &ldquo;
                  </span>
                  <p className="pl-5 text-sm text-foreground leading-relaxed font-medium">
                    {quote}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
