"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { dropClassCode, holdClassCode } from "@/lib/classLink";
import { theatreFontVars } from "@/lib/fonts/theatre";

/* A comp: the free ticket held at the box office under the teacher's name.
   The checkout ticket with a tear-off stub (globals.css, .t-ticket--comp). */

type LinkInfo = { teacher: string; school: string | null; days: number; active: boolean };
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
      {children}
    </div>
  );
}

function Closed({ dir, title }: { dir: string; title: string }) {
  return (
    <div className={shell}>
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

export function JoinClass({ code }: { code: string }) {
  const { user, loading } = useAuth();
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [missing, setMissing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [answer, setAnswer] = useState<JoinAnswer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get<LinkInfo>(`/api/class-links/${encodeURIComponent(code)}`)
      .then((r) => {
        setInfo(r.data);
        // Held for after signup, which may leave the site through Google.
        if (r.data.active) holdClassCode(code);
      })
      .catch(() => setMissing(true));
  }, [code]);

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

  if (missing) return <Closed dir="(no name on the list.)" title="That link doesn't open anything." />;
  if (!info) {
    return (
      <div className={shell}>
        <p className="t-box-office__dir">(the box office.)</p>
        <h1 className="t-box-office__title">One moment.</h1>
      </div>
    );
  }
  if (!info.active) return <Closed dir="(the house is closed.)" title="This link is switched off." />;

  const until = dateLabel(answer?.until ?? null);
  const admitted = answer && ["granted", "joined", "already"].includes(answer.outcome);
  const note: { title: string; body?: string } | null = answer
    ? ({
        granted: { title: "You're in.", body: until ? `Plus runs until ${until}.` : undefined },
        joined: { title: "You're already in.", body: until ? `Plus runs until ${until}.` : undefined },
        already: { title: "You already have Plus.", body: until ? `It runs until ${until}, so nothing changes.` : undefined },
        paying: { title: "You're on a paid plan.", body: "I left it as it is." },
        own_link: { title: "This is your own link.", body: "Students who open it get the comp." },
        full: { title: "The house is full on my end.", body: "Write to me at canberk@actorrise.com and I'll add you by hand." },
      } as Record<string, { title: string; body?: string }>)[answer.outcome] ?? { title: "Done." }
    : null;

  return (
    <div className={shell}>
      <p className="t-box-office__dir">(held at the box office.)</p>
      <h1 className="t-box-office__title">
        A seat for <em>{info.teacher}&rsquo;s class.</em>
      </h1>

      <div className="t-ticket t-ticket--comp">
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
            <span className="t-ticket__val">
              {info.teacher}
              {info.school ? ` · ${info.school}` : ""}
            </span>
          </Row>
          <Row label="Runs">
            <span className="t-ticket__val">{until ? `Until ${until}` : runsFor(info.days)}</span>
          </Row>
          <Row label="Due today">
            <span className="t-ticket__total">$0</span>
          </Row>

          {note && (
            <div className="t-ticket__note">
              <p className="t-ticket__note-title">{note.title}</p>
              {note.body && <p className="t-ticket__note-body">{note.body}</p>}
            </div>
          )}
          {failed && (
            <div className="t-ticket__note t-ticket__note--bad">
              <p className="t-ticket__note-title">That didn&rsquo;t go through.</p>
              <p className="t-ticket__note-body">Try again, or write to me at canberk@actorrise.com.</p>
            </div>
          )}

          <div className="t-ticket__foot">
            {answer ? (
              <Link href="/monologues" className="t-ticket__cta">
                Find a monologue
              </Link>
            ) : loading ? null : user ? (
              <button type="button" onClick={join} disabled={joining} className="t-ticket__cta">
                {joining ? "Taking your seat" : "Take your seat"}
              </button>
            ) : (
              <>
                <Link href="/signup?redirect=/monologues" className="t-ticket__cta">
                  Take your seat
                </Link>
                <Link href="/login?redirect=/monologues" className="t-ticket__quiet">
                  I already have an account
                </Link>
              </>
            )}
          </div>

          <p className="t-ticket__fine t-ticket__fine--note">
            {user && !answer
              ? `Signed in as ${user.email}.`
              : "No card, no code. I'm Canberk, an actor, and I built this on my own."}
          </p>
        </div>
      </div>
    </div>
  );
}
