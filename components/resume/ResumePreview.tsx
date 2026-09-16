"use client";

import { useEffect, useRef, useState } from "react";
import type { Credit } from "@/types/resume";
import { CREDIT_CATEGORIES } from "@/types/resume";

export interface ResumeProfile {
  name?: string | null;
  height?: string | null;
  hair_color?: string | null;
  eye_color?: string | null;
  union_status?: string | null;
  location?: string | null;
  training_background?: string | null;
  special_skills?: string[];
}

/**
 * The résumé document — a standard US actor one-pager rendered from profile +
 * credits. Deliberately follows industry format: name → union → contact →
 * physical stats (NO age), credits grouped by medium, commercials shown as
 * "conflicts available upon request" (never listed), no headshot on the page
 * itself. Always paper, in either theme, because it is a printout: what is on
 * screen is what comes out of the PDF. Same structure backs the server-side one.
 *
 * It is a SHEET now rather than a box that grows with its content: US Letter
 * proportions, so the thing on screen is the thing being handed over, and so
 * running past one page is visible. A casting director's first filter is
 * whether the résumé is one page; the old preview could not tell you that
 * because it simply got taller.
 */
export default function ResumePreview({
  profile,
  credits,
  email,
}: {
  profile: ResumeProfile;
  credits: Credit[];
  email?: string | null;
}) {
  const contact = [profile.location, email].filter(Boolean).join("  ·  ");
  const stats = [
    profile.height,
    profile.hair_color ? `Hair: ${profile.hair_color}` : null,
    profile.eye_color ? `Eyes: ${profile.eye_color}` : null,
  ].filter(Boolean);
  const skills = (profile.special_skills || []).filter(Boolean);

  /* Whether the content has run past the sheet. Measured rather than counted:
     a credit's height depends on how its title wraps, so "more than N rows" is
     not the question — "taller than the page" is. */
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const inkRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const sheet = sheetRef.current;
    const ink = inkRef.current;
    if (!sheet || !ink || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const room = sheet.clientHeight - parseFloat(getComputedStyle(sheet).paddingTop) * 2;
      setOverflowing(ink.scrollHeight > room + 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sheet);
    ro.observe(ink);
    return () => ro.disconnect();
  }, [credits, profile, email]);

  return (
    <div ref={sheetRef} className="t-paper" data-overflowing={overflowing || undefined}>
      <div ref={inkRef}>
        <h2 className="t-paper__name">{profile.name?.trim() || "Your Name"}</h2>
        {profile.union_status && <p className="t-paper__union">{profile.union_status}</p>}
        {(contact || stats.length > 0) && (
          <p className="t-paper__contact">
            {contact}
            {contact && stats.length > 0 && <br />}
            {stats.join("  ·  ")}
          </p>
        )}
        <hr className="t-paper__rule" />

        {CREDIT_CATEGORIES.map(({ id, heading }) => {
          const rows = credits.filter((c) => c.category === id);
          if (rows.length === 0) return null;

          // Commercials are never listed — industry convention.
          if (id === "commercial") {
            return (
              <section key={id} className="t-paper__section">
                <h3 className="t-paper__heading">{heading}</h3>
                <p className="t-paper__italic">Conflicts available upon request</p>
              </section>
            );
          }

          return (
            <section key={id} className="t-paper__section">
              <h3 className="t-paper__heading">{heading}</h3>
              {rows.map((c) => (
                <div key={c.id} className="t-paper__credit">
                  <span className="t-paper__prod">{c.production}</span>
                  <span className="t-paper__role">{c.role || ""}</span>
                  <span className="t-paper__house">
                    {[c.company, c.director].filter(Boolean).join(" · ")}
                  </span>
                  <span className="t-paper__year">{c.year || ""}</span>
                </div>
              ))}
            </section>
          );
        })}

        {credits.length === 0 && (
          <p className="t-paper__empty">a résumé starts with one credit.</p>
        )}

        {profile.training_background?.trim() && (
          <section className="t-paper__section">
            <h3 className="t-paper__heading">Training</h3>
            <p className="t-paper__body">{profile.training_background}</p>
          </section>
        )}

        {skills.length > 0 && (
          <section className="t-paper__section">
            <h3 className="t-paper__heading">Special Skills</h3>
            <p className="t-paper__body">{skills.join(", ")}</p>
          </section>
        )}
      </div>
    </div>
  );
}
