"use client";

import { useEffect, useState } from "react";

import api from "@/lib/api";
import { trackEvent } from "@/lib/events";

type ClassLinkSummary = {
  code: string;
  active: boolean;
  school: string | null;
  days: number;
  max_uses: number;
  granted: number;
  joined: number;
};

const SITE = "actorrise.com";

/**
 * A teacher's own class link, in the library where a teacher lands after
 * signup. Until 2026-10-27 every link waited on Canberk answering an email; the
 * one class that came in (Gilroy, 36 students) signed up together in a single
 * class period the day the teacher had it. So the card hands over the link and
 * that one piece of advice, and nothing else.
 *
 * A school address gets a link that works at once; any other waits until
 * Canberk switches it on (services/class_links.make_own_link).
 */
export function TeacherClassCard() {
  const [link, setLink] = useState<ClassLinkSummary | null | undefined>(undefined);
  const [school, setSchool] = useState("");
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<{ link: ClassLinkSummary | null }>("/api/class-links/mine")
      .then(({ data }) => live && setLink(data.link))
      .catch(() => live && setLink(null));
    return () => {
      live = false;
    };
  }, []);

  if (link === undefined) return null;

  async function make() {
    if (making) return;
    setMaking(true);
    setFailed(false);
    try {
      const { data } = await api.post<{ link: ClassLinkSummary }>("/api/class-links/mine", {
        school: school.trim() || null,
      });
      setLink(data.link);
      trackEvent("class_link_self_made", { active: data.link.active });
    } catch {
      setFailed(true);
    } finally {
      setMaking(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(`https://${url}`);
      setCopied(true);
      trackEvent("class_link_copied", {});
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // no clipboard (an old browser, a non-https preview): the link is on screen to type
    }
  }

  const pill =
    "inline-flex h-11 shrink-0 items-center rounded-full px-5 text-[15px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-60";

  return (
    <section
      aria-labelledby="class-card-h"
      className="mt-10 border-t pt-6"
      style={{ borderColor: "var(--t-line-light-2)", color: "var(--t-text)" }}
    >
      {link === null ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <div className="min-w-0 max-w-[52ch]">
            <h2 id="class-card-h" className="text-[17px] font-semibold leading-snug">
              Bring your class in
            </h2>
            <p className="mt-1 text-[15px] leading-normal" style={{ color: "var(--t-muted-dark)" }}>
              Make a link for your students. Everyone who signs up through it gets Plus for a month, on me.
            </p>
            <label className="mt-3 block text-sm" style={{ color: "var(--t-muted-dark)" }}>
              <span className="sr-only">Your school or studio</span>
              <input
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                maxLength={120}
                placeholder="Your school or studio (optional)"
                className="h-11 w-full max-w-sm border bg-transparent px-3 text-[15px] outline-none focus-visible:border-current"
                style={{ borderColor: "var(--t-line-light-2)", color: "var(--t-text)" }}
              />
            </label>
            {failed && (
              <p className="mt-2 text-sm" style={{ color: "var(--t-muted-dark)" }}>
                That didn&apos;t go through. Try once more, or email canberk@actorrise.com and I&apos;ll make it.
              </p>
            )}
          </div>
          <button type="button" onClick={make} disabled={making} className={`${pill} bg-primary text-primary-foreground`}>
            {making ? "Making it" : "Make my class link"}
          </button>
        </div>
      ) : (
        <div className="min-w-0">
          <h2 id="class-card-h" className="text-[17px] font-semibold leading-snug">
            Your class link
          </h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <code
              className="min-w-0 break-all border px-3 py-2.5 text-[13px] sm:text-[15px]"
              style={{ borderColor: "var(--t-line-light-2)" }}
            >
              {SITE}/join/{link.code}
            </code>
            <button
              type="button"
              onClick={() => copy(`${SITE}/join/${link.code}`)}
              className={`${pill} self-start border sm:self-auto`}
              style={{ borderColor: "var(--t-line-light-2)" }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-normal" style={{ color: "var(--t-muted-dark)" }}>
            {link.active ? (
              <>
                {link.granted === 0
                  ? "Nobody in yet. "
                  : `${link.granted} ${link.granted === 1 ? "student" : "students"} in. `}
                It works best when the class signs up together, in one class period. It takes about ten minutes, and
                each student gets Plus for a month.
              </>
            ) : (
              <>
                Your link is made. I switch new ones on by hand when the address isn&apos;t a school&apos;s, usually
                within a day. Once it&apos;s on, have the class sign up together in one class period.
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
