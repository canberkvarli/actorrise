"use client";

import { useState } from "react";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import { translate, useLocale, useT } from "@/lib/i18n";

/**
 * Lazy YouTube card: shows the thumbnail until clicked, then swaps in the
 * iframe. Keeps the /guides page fast (no autoplaying embeds on load).
 */
export function GuideVideoCard({ youtubeId, title }: { youtubeId: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const t = useT();
  const locale = useLocale();
  // The English title comes from the page's GUIDES list; other languages read the dictionary.
  const key = `contentGuides.videos.${youtubeId}.title` as const;
  const found = locale === "en" ? key : translate(locale, key);
  const label = found === key ? title : found;

  return (
    <div className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
      {playing ? (
        <iframe
          src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`}
          title={label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 w-full h-full cursor-pointer"
          aria-label={t("contentGuides.play", { title: label })}
        >
          <img
            src={`https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`}
            onError={(e) => {
              e.currentTarget.src = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
            }}
            alt={t("contentGuides.thumbnail", { title: label })}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0 bg-black/25 group-hover:bg-black/15 transition-colors" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/95 shadow-xl flex items-center justify-center group-hover:scale-110 group-hover:bg-white transition-all duration-300">
              <IconPlayerPlayFilled className="w-6 h-6 sm:w-7 sm:h-7 text-black/80 ml-0.5" />
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
