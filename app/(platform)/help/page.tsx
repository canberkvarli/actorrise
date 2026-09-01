"use client";

import { useState } from "react";
import { IconPlayerPlayFilled } from "@tabler/icons-react";

import { HELP_VIDEOS, type HelpVideo } from "@/lib/help-videos";
import { HelpVideoDialog } from "@/components/help/HelpVideoDialog";

export default function HelpPage() {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const active = HELP_VIDEOS.find((v) => v.slug === activeSlug) ?? null;
  const ready = HELP_VIDEOS.filter((v) => v.youtubeId);
  const unfilmed = HELP_VIDEOS.filter((v) => !v.youtubeId);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
      <header className="space-y-2">
        <p className="stage-direction text-xs text-muted-foreground/70">
          (the prompt book.)
        </p>
        <h1 className="font-brand text-3xl sm:text-4xl font-semibold">
          Quick guides
        </h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ready.map((video) => (
          <ReadyCard
            key={video.slug}
            video={video}
            onPlay={() => setActiveSlug(video.slug)}
          />
        ))}
      </div>

      {/* Unfilmed guides used to render as full "COMING SOON" cards, four of
          them against one real video. A page that is four fifths placeholder
          reads as abandoned rather than forthcoming. They are one quiet line
          until they exist, and each one becomes a card the moment its YouTube
          id is filled in. */}
      {unfilmed.length > 0 && (
        <p className="text-sm text-muted-foreground/70">
          Still filming: {unfilmed.map((v) => v.title.toLowerCase()).join(", ")}.
        </p>
      )}

      <HelpVideoDialog
        youtubeId={active?.youtubeId}
        title={active?.title ?? "Tutorial"}
        open={active !== null}
        onOpenChange={(open) => !open && setActiveSlug(null)}
      />
    </div>
  );
}

function ReadyCard({
  video,
  onPlay,
}: {
  video: HelpVideo;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="group overflow-hidden rounded-lg border border-border text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-video bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://img.youtube.com/vi/${video.youtubeId}/hqdefault.jpg`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/0" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-105">
            <IconPlayerPlayFilled className="ml-0.5 h-5 w-5" />
          </div>
        </div>
        {/* Non-interactive badge: sharp corners */}
        <span className="absolute bottom-2 right-2 bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
          {video.durationLabel}
        </span>
      </div>
      <div className="p-4">
        <h2 className="font-medium">{video.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{video.description}</p>
      </div>
    </button>
  );
}

