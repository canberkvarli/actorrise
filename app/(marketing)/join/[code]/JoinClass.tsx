"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { dropClassCode, holdClassCode } from "@/lib/classLink";
import { theatreFontVars } from "@/lib/fonts/theatre";

/* A comp: the free ticket held at the box office under the teacher's name.
   The checkout ticket with a tear-off stub (globals.css, .t-ticket--comp).
   The link is read on the server (page.tsx), so the ticket is in the first
   paint and only the buttons wait for the session. */

export type LinkInfo = { teacher: string; school: string | null; days: number; active: boolean };
type JoinAnswer = { outcome: string; until: string | null; teacher: string };

const shell = `t-box-office theatre-tokens ${theatreFontVars} container mx-auto max-w-2xl px-4 pb-20 pt-32 md:pt-40`;

function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function runsFor(days: number): string {
  if (days === 30) return "One month";
  if (days === 14) return "Two weeks";
  return `${days} days`;
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
  return (
    <div className={`${shell} t-comp-enter`}>
      <p className="t-box-office__dir">{dir}</p>
      <h1 className="t-box-office__title">{title}</h1>
      <div className="t-ticket">
        <p className="t-ticket__blurb">Check the link with your teacher, or write to me and I&rsquo;ll sort it.</p>
        <div className="t-ticket__foot">
          <a href="mailto:canberk@actorrise.com" className="t-ticket__cta">
            canberk@actorrise.com
          </a>
        </div>
      </div>
    </div>
  );
}

const NOTES: Record<string, (until: string | null) => { title: string; body?: string }> = {
  granted: (u) => ({ title: "You're in.", body: u ? `Plus runs until ${u}.` : undefined }),
  joined: (u) => ({ title: "You're already in.", body: u ? `Plus runs until ${u}.` : undefined }),
  already: (u) => ({ title: "You already have Plus.", body: u ? `It runs until ${u}, so nothing changes.` : undefined }),
  paying: () => ({ title: "You're on a paid plan.", body: "I left it as it is." }),
  own_link: () => ({ title: "This is your own link.", body: "Students who open it get the comp." }),
  full: () => ({ title: "The house is full on my end.", body: "Write to me at canberk@actorrise.com and I'll add you by hand." }),
};

export function JoinClass({ code, info }: { code: string; info: LinkInfo | null }) {
  const { user, loading } = useAuth();
  const [joining, setJoining] = useState(false);
  const [answer, setAnswer] = useState<JoinAnswer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Held for after signup, which may leave the site through Google.
    if (info?.active) holdClassCode(code);
  }, [code, info?.active]);

  if (!info) return <Closed dir="(no name on the list.)" title="That link doesn't open anything." />;
  if (!info.active) return <Closed dir="(the house is closed.)" title="This link is switched off." />;

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

  const until = dateLabel(answer?.until ?? null);
  const admitted = !!answer && ["granted", "joined", "already"].includes(answer.outcome);
  const note = answer ? (NOTES[answer.outcome]?.(until) ?? { title: "Done." }) : null;

  return (
    <div className={shell}>
      <p className="t-box-office__dir t-comp-enter">(held at the box office.)</p>
      <h1 className="t-box-office__title t-comp-enter" style={{ animationDelay: "60ms" }}>
        A seat for <em>{info.teacher}&rsquo;s class.</em>
      </h1>

      <div className="t-ticket t-ticket--comp t-comp-enter" style={{ animationDelay: "140ms" }}>
        <div className="t-comp__stub" aria-hidden>
          <span>Admit one</span>
        </div>
        <div className="t-comp__body">
          {admitted && <span className="t-comp__stamp">Admitted</span>}
          <div className="t-ticket__head">
            <h2 className="t-ticket__plan">Plus</h2>
            {!admitted && <span className="t-ticket__tag">Comp</span>}
          </div>

          <hr className="t-ticket__rule" />
          <Row label="Class">
            {info.teacher}
            {info.school ? ` · ${info.school}` : ""}
          </Row>
          <Row label="Runs">{until ? `Until ${until}` : runsFor(info.days)}</Row>

          {note && (
            <div className="t-ticket__note t-comp-fade">
              <p className="t-ticket__note-title">{note.title}</p>
              {note.body && <p className="t-ticket__note-body">{note.body}</p>}
            </div>
          )}
          {failed && (
            <div className="t-ticket__note t-ticket__note--bad t-comp-fade">
              <p className="t-ticket__note-title">That didn&rsquo;t go through.</p>
              <p className="t-ticket__note-body">Try again, or write to me at canberk@actorrise.com.</p>
            </div>
          )}

          {/* Holds its height while the session loads, so nothing below moves
              when the buttons arrive. */}
          <div className="t-ticket__foot t-comp__foot">
            {answer ? (
              <Link href="/monologues" className="t-ticket__cta t-comp-fade">
                Find a monologue
              </Link>
            ) : loading ? null : user ? (
              <button type="button" onClick={join} disabled={joining} className="t-ticket__cta t-comp-fade">
                {joining ? "Taking your seat" : "Take your seat"}
              </button>
            ) : (
              <>
                <Link href="/signup?redirect=/monologues" className="t-ticket__cta t-comp-fade">
                  Take your seat
                </Link>
                <Link href="/login?redirect=/monologues" className="t-ticket__quiet t-comp-fade">
                  I already have an account
                </Link>
              </>
            )}
          </div>

          {user && !answer && (
            <p className="t-ticket__fine t-ticket__fine--note">Signed in as {user.email}.</p>
          )}
        </div>
      </div>
    </div>
  );
}
