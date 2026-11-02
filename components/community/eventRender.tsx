"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import type { FeedEvent } from "@/hooks/useCommunityFeed";
import { translate, useLocale, useT, type Locale, type MessageKey } from "@/lib/i18n";

/* Shared renderers for the activity feed — used by both the compact Callboard
   panel (on the /practice landing) and the full feed view. */

function genderNoun(g?: string): string | null {
  const s = (g || "").toLowerCase();
  if (s.startsWith("f") || s === "woman") return "woman";
  if (s.startsWith("m") || s === "man") return "man";
  return null;
}

function pronounKey(g?: string): MessageKey {
  const n = genderNoun(g);
  return n === "woman"
    ? "appShellCallboard.pronounHer"
    : n === "man"
      ? "appShellCallboard.pronounHis"
      : "appShellCallboard.pronounTheir";
}

/* The feed's payload words (tone, emotion, themes) are the parser's English
   vocabulary, so they arrive in English whatever the reader speaks. These are
   the ones common enough to be worth a Turkish label; anything else prints as
   it came, which is still the truth about what was searched. */
const TR_WORDS: Record<string, string> = {
  comedic: "komik",
  comic: "komik",
  comedy: "komedi",
  funny: "komik",
  dramatic: "dramatik",
  drama: "dram",
  serious: "ciddi",
  romantic: "romantik",
  dark: "karanlık",
  classical: "klasik",
  contemporary: "çağdaş",
  defiant: "başkaldıran",
  sad: "hüzünlü",
  angry: "öfkeli",
  joy: "neşe",
  sadness: "hüzün",
  anger: "öfke",
  fear: "korku",
  love: "aşk",
  grief: "yas",
  hope: "umut",
  women: "kadınlar",
  men: "erkekler",
  female: "kadın",
  male: "erkek",
  woman: "kadın",
  man: "erkek",
};

/** A payload word in the reader's language, when there is one. */
export function feedWord(value: string, locale: Locale): string {
  if (locale !== "tr") return value;
  return TR_WORDS[value.toLowerCase()] ?? value;
}

/* Turkish says a decade with a suffix that follows the vowel of the number:
   20'li, 30'lu, 40'lı, 60'lı. Anything that is not "20s" prints as it came. */
const TR_DECADE: Record<string, string> = {
  "1": "lu",
  "2": "li",
  "3": "lu",
  "4": "lı",
  "5": "li",
  "6": "lı",
  "7": "li",
  "8": "li",
  "9": "lı",
};
export function feedAge(age: string, locale: Locale): string {
  if (locale !== "tr") return age;
  const m = /^(\d)0s$/.exec(age.trim());
  return m ? `${m[1]}0'${TR_DECADE[m[1]]}` : age;
}

// A typewriter span for any piece/play title — matches the app's rule that
// monologue titles render in the typewriter face.
function Title({ children }: { children: React.ReactNode }) {
  // align-baseline: Courier's line box differs from the sans around it, so in
  // any flex/inline-block context the title would otherwise ride high.
  //
  // The colour is inherited, not set. It used to be `text-foreground/90`, which
  // is near-white in dark mode — correct on the dark /practice panel, and
  // white-on-white inside a bone-paper Callboard notice, where it made every
  // saved-piece title invisible. Inheriting means the title is always legible
  // against whatever surface it was dropped onto; weight carries the emphasis
  // that colour used to.
  return (
    <span className="font-typewriter align-baseline font-medium text-current">{children}</span>
  );
}

/** "just now", "5m ago". `locale` defaults to English for callers that have
 *  not moved over; a component that has one passes useLocale(). */
export function relativeTime(iso: string, locale: Locale = "en"): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return translate(locale, "appShellCallboard.agoJustNow");
  const mins = Math.floor(secs / 60);
  if (mins < 60) return translate(locale, "appShellCallboard.agoM", { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return translate(locale, "appShellCallboard.agoH", { n: hrs });
  const days = Math.floor(hrs / 24);
  return translate(locale, "appShellCallboard.agoD", { n: days });
}

/** A translated line with the play's title dropped in where it says {title},
 *  so Turkish can put the title wherever its word order wants it. */
function WithTitle({ text, title }: { text: string; title: React.ReactNode }) {
  const parts = text.split("{title}");
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <Title>{title}</Title>}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/** The event sentence, with titles styled in typewriter. */
export function EventLine({ e }: { e: FeedEvent }) {
  const t = useT();
  const locale = useLocale();
  const p = e.payload;
  // {title} is left in the template for WithTitle, not interpolated.
  const keepTitle = { title: "{title}" };
  switch (e.event_type) {
    case "joined":
      return (
        <>
          {e.city
            ? t("appShellCallboard.lineJoinedFrom", { city: e.city })
            : t("appShellCallboard.lineJoined")}
        </>
      );
    case "searched": {
      const g = genderNoun(p.gender);
      const age = p.age_range ? feedAge(p.age_range, locale) : "";
      const piece = p.tone
        ? t("appShellCallboard.linePieceTone", { tone: feedWord(p.tone, locale) })
        : t("appShellCallboard.linePiece");
      let who = "";
      if (g) {
        const gender = t(g === "woman" ? "appShellCallboard.genderWoman" : "appShellCallboard.genderMan");
        who = age
          ? t("appShellCallboard.lineWhoGenderAge", { gender, age, pronoun: t(pronounKey(p.gender)) })
          : t("appShellCallboard.lineWhoGender", { gender });
      } else if (age) {
        who = t("appShellCallboard.lineWhoAge", { age });
      }
      return <>{t("appShellCallboard.lineSearching", { piece, who })}</>;
    }
    case "viewed":
      return p.title ? (
        <WithTitle text={t("appShellCallboard.lineReading", keepTitle)} title={p.title} />
      ) : (
        <>{t("appShellCallboard.lineReadingNone")}</>
      );
    case "bookmarked":
      return p.title ? (
        <WithTitle text={t("appShellCallboard.lineSaved", keepTitle)} title={p.title} />
      ) : (
        <>{t("appShellCallboard.lineSavedNone")}</>
      );
    case "worked":
      return <>{t("appShellCallboard.lineWorked")}</>;
    case "rehearsed":
      return (
        <>
          {p.line_count
            ? t("appShellCallboard.lineRehearsedLines", { n: p.line_count })
            : t("appShellCallboard.lineRehearsed")}
        </>
      );
    case "rehearsing":
      return p.title ? (
        <WithTitle text={t("appShellCallboard.lineRehearsing", keepTitle)} title={p.title} />
      ) : (
        <>{t("appShellCallboard.lineRehearsingNone")}</>
      );
    case "shared":
      return p.title ? (
        <WithTitle text={t("appShellCallboard.lineShared", keepTitle)} title={p.title} />
      ) : (
        <>{t("appShellCallboard.lineSharedNone")}</>
      );
    case "milestone":
      return <>{t("appShellCallboard.lineMilestone", { n: p.milestone_n ?? "" })}</>;
    // "went_plus" is retired: it published billing status next to a real name
    // and face. Filtered server-side too; falls through to null if one slips by.
    case "trending":
      return (
        <WithTitle
          text={
            p.reader_count
              ? t("appShellCallboard.lineTrendingReaders", { ...keepTitle, n: p.reader_count })
              : t("appShellCallboard.lineTrending", keepTitle)
          }
          title={p.title}
        />
      );
    default:
      return null;
  }
}

/** Where the card's action chip walks the actor — into the paywall funnel. */
export function chipFor(e: FeedEvent, locale: Locale = "en"): { label: string; href: string } | null {
  const id = e.payload.monologue_id;
  switch (e.event_type) {
    case "viewed":
    case "bookmarked":
    case "trending":
      return {
        label: translate(locale, "appShellCallboard.chipRead"),
        href: id ? `/monologue/${id}` : "/monologues",
      };
    case "searched":
      return { label: translate(locale, "appShellCallboard.chipFind"), href: "/monologues" };
    case "worked":
    case "rehearsed":
      return { label: translate(locale, "appShellCallboard.chipRehearse"), href: "/rehearse" };
    default:
      return null; // joined / went_plus / milestone are social proof, not actions
  }
}

export function Avatar({ e, size = 44 }: { e: FeedEvent; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initial = (e.name?.[0] || "?").toUpperCase();
  const showImg = e.headshot_url && !failed;
  const dim = { width: size, height: size };
  return (
    <div className="relative shrink-0" style={dim}>
      <div className="absolute inset-0 rounded-full bg-[var(--stage-glow,oklch(0.72_0.17_55))] opacity-20 blur-md" />
      {showImg ? (
        <Image
          src={e.headshot_url as string}
          alt=""
          width={size}
          height={size}
          unoptimized
          onError={() => setFailed(true)}
          className="relative rounded-full object-cover ring-1 ring-primary/30"
          style={dim}
        />
      ) : (
        <span
          className="relative flex items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary/90 font-semibold text-background ring-1 ring-primary/30"
          style={{ ...dim, fontSize: size * 0.32 }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
