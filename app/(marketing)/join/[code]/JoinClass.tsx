"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { dropClassCode, holdClassCode } from "@/lib/classLink";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { useLocale, useT, type MessageKey } from "@/lib/i18n";

/* A comp: the free ticket held at the box office under the teacher's name.
   The checkout ticket with a tear-off stub (globals.css, .t-ticket--comp).
   The link is read on the server (page.tsx), so the ticket is in the first
   paint and only the buttons wait for the session. */

export type LinkInfo = { teacher: string; school: string | null; days: number; active: boolean };
type JoinAnswer = { outcome: string; until: string | null; teacher: string };

const shell = `t-box-office theatre-tokens ${theatreFontVars} container mx-auto max-w-2xl px-4 pb-20 pt-32 md:pt-40`;

function dateLabel(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(locale === "tr" ? "tr-TR" : undefined, {
    month: "long",
    day: "numeric",
  });
}

function runsFor(days: number, t: ReturnType<typeof useT>): string {
  if (days === 30) return t("audJoin.runsMonth");
  if (days === 14) return t("audJoin.runsTwoWeeks");
  return t("audJoin.runsDays", { days });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="t-ticket__row">
      <span className="t-ticket__label">{label}</span>
      <span className="t-ticket__lead" aria-hidden />
      <span className="t-ticket__val">{children}</span>
    </div>
  );
}

function Closed({ dir, title }: { dir: string; title: string }) {
  const t = useT();
  return (
    <div className={`${shell} t-comp-enter`}>
      <p className="t-box-office__dir">{dir}</p>
      <h1 className="t-box-office__title">{title}</h1>
      <div className="t-ticket">
        <p className="t-ticket__blurb">{t("audJoin.closedBlurb")}</p>
        <div className="t-ticket__foot">
          <a href="mailto:canberk@actorrise.com" className="t-ticket__cta">
            canberk@actorrise.com
          </a>
        </div>
      </div>
    </div>
  );
}

/* body: shown always. untilBody: shown only when there is a date, as {until}. */
const NOTES: Record<string, { title: MessageKey; body?: MessageKey; untilBody?: MessageKey }> = {
  granted: { title: "audJoin.grantedTitle", untilBody: "audJoin.runsUntil" },
  joined: { title: "audJoin.joinedTitle", untilBody: "audJoin.runsUntil" },
  already: { title: "audJoin.alreadyTitle", untilBody: "audJoin.alreadyBody" },
  paying: { title: "audJoin.payingTitle", body: "audJoin.payingBody" },
  own_link: { title: "audJoin.ownLinkTitle", body: "audJoin.ownLinkBody" },
  full: { title: "audJoin.fullTitle", body: "audJoin.fullBody" },
};

export function JoinClass({ code, info }: { code: string; info: LinkInfo | null }) {
  const { user, loading } = useAuth();
  const [joining, setJoining] = useState(false);
  const [answer, setAnswer] = useState<JoinAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    // Held for after signup, which may leave the site through Google.
    if (info?.active) holdClassCode(code);
  }, [code, info?.active]);

  if (!info) return <Closed dir={t("audJoin.noLinkDir")} title={t("audJoin.noLinkTitle")} />;
  if (!info.active) return <Closed dir={t("audJoin.offDir")} title={t("audJoin.offTitle")} />;

  const join = async () => {
    setJoining(true);
    setFailed(false);
    try {
      const r = await api.post<JoinAnswer>(`/api/class-links/${encodeURIComponent(code)}/join`);
      dropClassCode();
      setAnswer(r.data);
    } catch {
      setFailed(true);
    } finally {
      setJoining(false);
    }
  };

  const until = dateLabel(answer?.until ?? null, locale);
  const admitted = !!answer && ["granted", "joined", "already"].includes(answer.outcome);
  const spec = answer ? NOTES[answer.outcome] : undefined;
  const note = answer
    ? spec
      ? {
          title: t(spec.title),
          body: spec.body
            ? t(spec.body)
            : spec.untilBody && until
              ? t(spec.untilBody, { until })
              : undefined,
        }
      : { title: t("audJoin.done"), body: undefined }
    : null;

  return (
    <div className={shell}>
      <p className="t-box-office__dir t-comp-enter">{t("audJoin.heldDir")}</p>
      <h1 className="t-box-office__title t-comp-enter" style={{ animationDelay: "60ms" }}>
        {t("audJoin.seatA")}
        <em>{t("audJoin.seatEm", { teacher: info.teacher })}</em>
        {t("audJoin.seatB")}
      </h1>

      <div className="t-ticket t-ticket--comp t-comp-enter" style={{ animationDelay: "140ms" }}>
        <div className="t-comp__stub" aria-hidden>
          <span>{t("audJoin.admitOne")}</span>
        </div>
        <div className="t-comp__body">
          {admitted && <span className="t-comp__stamp">{t("audJoin.admitted")}</span>}
          <div className="t-ticket__head">
            <h2 className="t-ticket__plan">Plus</h2>
            {!admitted && <span className="t-ticket__tag">{t("audJoin.comp")}</span>}
          </div>

          <hr className="t-ticket__rule" />
          <Row label={t("audJoin.rowClass")}>
            {info.teacher}
            {info.school ? ` · ${info.school}` : ""}
          </Row>
          <Row label={t("audJoin.rowRuns")}>
            {until ? t("audJoin.until", { date: until }) : runsFor(info.days, t)}
          </Row>

          {note && (
            <div className="t-ticket__note t-comp-fade">
              <p className="t-ticket__note-title">{note.title}</p>
              {note.body && <p className="t-ticket__note-body">{note.body}</p>}
            </div>
          )}
          {failed && (
            <div className="t-ticket__note t-ticket__note--bad t-comp-fade">
              <p className="t-ticket__note-title">{t("audJoin.failedTitle")}</p>
              <p className="t-ticket__note-body">{t("audJoin.failedBody")}</p>
            </div>
          )}

          {/* Holds its height while the session loads, so nothing below moves
              when the buttons arrive. */}
          <div className="t-ticket__foot t-comp__foot">
            {answer ? (
              <Link href="/monologues" className="t-ticket__cta t-comp-fade">
                {t("audJoin.findMonologue")}
              </Link>
            ) : loading ? null : user ? (
              <button type="button" onClick={join} disabled={joining} className="t-ticket__cta t-comp-fade">
                {joining ? t("audJoin.takingSeat") : t("audJoin.takeSeat")}
              </button>
            ) : (
              <>
                <Link href="/signup?redirect=/monologues" className="t-ticket__cta t-comp-fade">
                  {t("audJoin.takeSeat")}
                </Link>
                <Link href="/login?redirect=/monologues" className="t-ticket__quiet t-comp-fade">
                  {t("audJoin.haveAccount")}
                </Link>
              </>
            )}
          </div>

          {user && !answer && (
            <p className="t-ticket__fine t-ticket__fine--note">{t("audJoin.signedInAs", { email: user.email ?? "" })}</p>
          )}
        </div>
      </div>
    </div>
  );
}
