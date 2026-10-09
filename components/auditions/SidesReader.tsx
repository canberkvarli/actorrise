"use client";

import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { theatreFontVars } from "@/lib/fonts/theatre";
import { trackEvent } from "@/lib/events";
import type { Audition } from "@/lib/auditions";
import { useSidesText } from "@/hooks/useAuditions";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";

/**
 * The sides, all of them, read on the audition's own page: a sheet of paper
 * that opens over it. Running them is still ScenePartner's job; reading isn't.
 */
export function SidesReader({ a, open, onOpenChange, runHref }: {
  a: Audition; open: boolean; onOpenChange: (open: boolean) => void; runHref?: string;
}) {
  const { data, isLoading, isError, refetch } = useSidesText(a.id, open);
  const title = data?.title ?? a.sides?.title ?? "Your sides";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={`theatre-tokens theatre-auditions ${theatreFontVars} aud-reader`}
        >
          <header className="aud-reader-head flex items-center justify-between gap-4 px-5 py-3.5 sm:px-7">
            <div className="min-w-0">
              <p className="aud-eyebrow">{a.project}{a.role ? ` · ${a.role}` : ""}</p>
              <DialogTitle className="aud-sec-title mt-1 truncate text-[24px]">{title}</DialogTitle>
            </div>
            <DialogPrimitive.Close className="aud-x aud-focus" aria-label="Close the sides">
              <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </DialogPrimitive.Close>
          </header>

          <div className="aud-reader-body">
            {isLoading ? (
              <div className="grid gap-3 px-1 py-2" role="status" aria-label="Getting your sides">
                {[90, 70, 84, 40, 76, 62].map((w, i) => (
                  <span key={i} className="aud-ghost-bar block h-3.5" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : isError ? (
              <p className="aud-pencil-muted text-[18px]">
                (I couldn&apos;t open them just now.{" "}
                <button type="button" className="aud-link not-italic" onClick={() => refetch()}>try again</button>)
              </p>
            ) : data?.text ? (
              <article className="aud-reader-page">{data.text}</article>
            ) : (
              <p className="aud-pencil-muted text-[18px]">
                {data?.status === "processing" || data?.status === "pending"
                  ? "(still reading them in. give it a minute.)"
                  : "(I couldn't find any words in that PDF.)"}
              </p>
            )}
          </div>

          {runHref && (
            <footer className="aud-reader-foot flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-7">
              <span className="aud-cap-muted text-[13.5px]">Want a reader for the other lines?</span>
              <Link
                href={runHref}
                className="aud-link text-[14px] font-semibold"
                onClick={() => trackEvent("audition_prep_started", { audition_id: a.id, kind: "sides" })}
              >
                run them with ScenePartner
              </Link>
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
