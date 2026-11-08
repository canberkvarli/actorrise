"use client";

import { IconExternalLink } from "@tabler/icons-react";
import { useT } from "@/lib/i18n";
import { trackEvent } from "@/lib/events";

export type InPrintReference = {
  id: number;
  play_title: string;
  character_name: string;
  author: string;
  publisher?: string | null;
  character_gender?: string | null;
  character_age?: string | null;
  genre?: string | null;
  year?: number | null;
  get_script_url?: string | null;
};

/**
 * Published pieces the library points at but does not hold (backend
 * app/services/search/reference_strip.py, CAN-24). Contemporary plays are
 * almost all in copyright, so for the asks the library is thinnest on we say
 * who speaks it, in which play, and where to get the script. No speech is
 * shown because none is held.
 */
export function ReferenceStrip({
  refs,
  query,
}: {
  refs: InPrintReference[];
  query: string;
}) {
  const t = useT();
  if (refs.length === 0) return null;
  return (
    <section aria-label={t("appSearchReferenceStrip.aria")} className="mt-8 mb-4 border-t border-border pt-3">
      <p className="stage-direction mb-3 text-sm text-muted-foreground">
        {t("appSearchReferenceStrip.direction")}
      </p>
      <ul className="divide-y divide-border">
        {refs.map((r) => {
          const facts = [
            r.character_age ? t("appSearchReferenceStrip.age", { age: r.character_age }) : null,
            r.genre,
            r.year ? String(r.year) : null,
          ].filter(Boolean) as string[];
          return (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">
                  {r.character_name}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    {t("appSearchReferenceStrip.in")} <span className="italic">{r.play_title}</span>
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {r.author}
                  {r.publisher ? ` · ${r.publisher}` : ""}
                </p>
                {facts.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {facts.map((f) => (
                      <span key={f} className="border border-border px-1.5 py-0.5 text-xs capitalize text-muted-foreground">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {r.get_script_url && (
                <a
                  href={r.get_script_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    trackEvent("reference_clicked", { reference_id: r.id, query: query.slice(0, 120) })
                  }
                  className="inline-flex items-center gap-1 rounded-md text-sm text-primary underline-offset-4 hover:underline"
                >
                  {t("appSearchReferenceStrip.getScript")}
                  <IconExternalLink size={14} aria-hidden />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
