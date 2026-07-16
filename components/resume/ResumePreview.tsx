"use client";

import Image from "next/image";
import type { Credit } from "@/types/resume";
import { CREDIT_CATEGORIES } from "@/types/resume";

export interface ResumeProfile {
  name?: string | null;
  age_range?: string | null;
  height?: string | null;
  union_status?: string | null;
  training_background?: string | null;
  special_skills?: string[];
  headshot_url?: string | null;
}

/**
 * The résumé document itself — a clean industry one-pager rendered from profile
 * + credits. Always light ("paper"), since it represents a printed page. This
 * same structure will back the server-side PDF in Increment 2.
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
  const stats = [profile.age_range, profile.height, profile.union_status].filter(Boolean);
  const skills = (profile.special_skills || []).filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-[8.5in] bg-white text-neutral-900 shadow-sm ring-1 ring-black/10">
      <div className="p-8 sm:p-10" style={{ fontFamily: "var(--font-sans)" }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-5">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold leading-tight text-neutral-900">
              {profile.name?.trim() || "Your Name"}
            </h1>
            {stats.length > 0 && (
              <p className="mt-1.5 text-sm text-neutral-700">{stats.join("  ·  ")}</p>
            )}
            {email && <p className="mt-0.5 text-sm text-neutral-700">{email}</p>}
          </div>
          {profile.headshot_url && (
            <div className="relative h-24 w-20 shrink-0 overflow-hidden ring-1 ring-black/10">
              <Image src={profile.headshot_url} alt="" fill className="object-cover" sizes="80px" unoptimized />
            </div>
          )}
        </div>

        {/* Credits by category */}
        {CREDIT_CATEGORIES.map(({ id, heading }) => {
          const rows = credits.filter((c) => c.category === id);
          if (rows.length === 0) return null;
          return (
            <section key={id} className="mt-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                {heading}
              </h2>
              <table className="mt-1.5 w-full border-collapse text-sm">
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="align-top">
                      <td className="py-1 pr-3 font-medium text-neutral-900">{c.production}</td>
                      <td className="py-1 pr-3 text-neutral-700">{c.role || ""}</td>
                      <td className="py-1 text-right text-neutral-600 whitespace-nowrap">
                        {[c.company, c.director, c.year].filter(Boolean).join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}

        {credits.length === 0 && (
          <p className="mt-6 text-sm italic text-neutral-400">
            Add a credit to start building your résumé.
          </p>
        )}

        {/* Training */}
        {profile.training_background?.trim() && (
          <section className="mt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Training</h2>
            <p className="mt-1.5 text-sm text-neutral-800">{profile.training_background}</p>
          </section>
        )}

        {/* Special skills */}
        {skills.length > 0 && (
          <section className="mt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Special Skills
            </h2>
            <p className="mt-1.5 text-sm text-neutral-800">{skills.join(", ")}</p>
          </section>
        )}
      </div>
    </div>
  );
}
