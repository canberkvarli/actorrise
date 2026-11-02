"use client";

import { useState } from "react";
import Link from "next/link";
import { IconPlayerPlayFilled } from "@tabler/icons-react";

import { HELP_VIDEOS, type HelpVideo } from "@/lib/help-videos";
import { HelpVideoDialog } from "@/components/help/HelpVideoDialog";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { useLocale, useT, type MessageKey } from "@/lib/i18n";

/**
 * /help — the prompt book.
 *
 * One video exists. It was rendering into a three-column grid, so the page was
 * a single small card in the left third of an empty row, under a line naming
 * three films that do not exist yet: mostly gap, mostly promise.
 *
 * The film that exists is billed like a film. The rest of the page stops
 * promising and starts pointing — at the walkthrough already in the product,
 * and at the way to reach a person. The unfilmed list stays, because saying
 * "this is coming" is honest; it just is not the page any more.
 */

/** Real places an actor can already get unstuck. Nothing here is aspirational. */
const WAYS: { what: MessageKey; where: MessageKey; href: string }[] = [
  {
    what: "appShellHelp.wayScenePartner",
    where: "appShellHelp.wayScenePartnerWhere",
    href: "/practice",
  },
  { what: "appShellHelp.wayPlan", where: "appShellHelp.wayPlanWhere", href: "/billing" },
  { what: "appShellHelp.wayElse", where: "appShellHelp.wayElseWhere", href: "/contact" },
];

/** The films' words, by slug. lib/help-videos.ts stays the English record
 *  (other screens read it); a slug missing here prints that record as is. */
const VIDEO_COPY: Record<string, { title: MessageKey; body: MessageKey }> = {
  "run-your-first-scene": {
    title: "appShellHelp.videoRunFirstSceneTitle",
    body: "appShellHelp.videoRunFirstSceneBody",
  },
  "getting-started": {
    title: "appShellHelp.videoGettingStartedTitle",
    body: "appShellHelp.videoGettingStartedBody",
  },
  "upload-a-script": {
    title: "appShellHelp.videoUploadTitle",
    body: "appShellHelp.videoUploadBody",
  },
  "pick-character-and-pacing": {
    title: "appShellHelp.videoPacingTitle",
    body: "appShellHelp.videoPacingBody",
  },
};

function useVideoCopy() {
  const t = useT();
  return (v: HelpVideo) => {
    const copy = VIDEO_COPY[v.slug];
    return copy
      ? { title: t(copy.title), description: t(copy.body) }
      : { title: v.title, description: v.description };
  };
}

export default function HelpPage() {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const active = HELP_VIDEOS.find((v) => v.slug === activeSlug) ?? null;
  const ready = HELP_VIDEOS.filter((v) => v.youtubeId);
  const unfilmed = HELP_VIDEOS.filter((v) => !v.youtubeId);
  const t = useT();
  const locale = useLocale();
  const copyOf = useVideoCopy();

  return (
    <div
      className={`theatre-tokens theatre-stage ${theatreFontVars} container relative mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8`}
    >
      <header>
        <p className="t-slug">{t("appShellHelp.direction")}</p>
        <h1 className="t-resume__title">{t("appShellHelp.title")}</h1>
      </header>

      {/* The films. One today, and it is billed like one — a grid of three
          columns holding a single card is a page telling you what it is
          missing. Two or more and they sit side by side. */}
      {ready.length > 0 && (
        <div className={ready.length > 1 ? "mt-12 grid gap-12 lg:grid-cols-2" : "mt-12"}>
          {ready.map((video, i) => (
            <Guide
              key={video.slug}
              video={video}
              billing={ready.length > 1 ? t("appShellHelp.onFilm") : i === 0 ? t("appShellHelp.theOneOnFilm") : t("appShellHelp.onFilm")}
              onPlay={() => setActiveSlug(video.slug)}
            />
          ))}
        </div>
      )}

      <section className="mt-16">
        <h2 className="t-build__head">
          <span>{t("appShellHelp.otherWays")}</span>
        </h2>
        <div className="mt-3 max-w-2xl">
          {WAYS.map((d) => (
            <Link key={d.href} href={d.href} className="t-way">
              <span className="t-way__what">{t(d.what)}</span>
              <span aria-hidden className="t-way__dots" />
              <span className="t-way__where">{t(d.where)}</span>
            </Link>
          ))}
        </div>
      </section>

      {unfilmed.length > 0 && (
        <section className="mt-14">
          <h2 className="t-build__head">
            <span>{t("appShellHelp.stillToFilm")}</span>
          </h2>
          <p className="t-guide__pending mt-3">
            {unfilmed
              .map((v) => copyOf(v).title.toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-US"))
              .join(" · ")}
          </p>
        </section>
      )}

      <HelpVideoDialog
        youtubeId={active?.youtubeId}
        title={active ? copyOf(active).title : t("appShellHelp.tutorial")}
        open={active !== null}
        onOpenChange={(open) => !open && setActiveSlug(null)}
      />
    </div>
  );
}

function Guide({
  video,
  billing,
  onPlay,
}: {
  video: HelpVideo;
  billing: string;
  onPlay: () => void;
}) {
  const copy = useVideoCopy()(video);
  return (
    <button type="button" onClick={onPlay} className="t-guide">
      <span className="t-guide__still">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://img.youtube.com/vi/${video.youtubeId}/hqdefault.jpg`}
          alt=""
        />
        <span className="t-guide__play">
          <span>
            <IconPlayerPlayFilled className="ml-0.5 h-6 w-6" />
          </span>
        </span>
        <span className="t-guide__runtime">{video.durationLabel}</span>
      </span>
      <span className="block">
        <span className="t-guide__billing block">{billing}</span>
        <span className="t-guide__title block">{copy.title}</span>
        <span className="t-guide__line block">{copy.description}</span>
      </span>
    </button>
  );
}
