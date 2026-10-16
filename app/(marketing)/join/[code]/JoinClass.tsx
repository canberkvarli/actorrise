"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { dropClassCode, holdClassCode } from "@/lib/classLink";

type LinkInfo = { teacher: string; school: string | null; days: number; active: boolean };
type JoinAnswer = { outcome: string; until: string | null; teacher: string };

function untilLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export function JoinClass({ code }: { code: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
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

  if (missing) {
    return (
      <StageHero
        direction="(no such class.)"
        title="That link doesn't open anything."
        lede="Check it with your teacher, or write to me at canberk@actorrise.com and I'll sort it."
      />
    );
  }

  if (!info) return <StageHero direction="(one moment.)" title="Finding your class" />;

  const whose = info.school ? `${info.teacher}'s class at ${info.school}` : `${info.teacher}'s class`;

  if (!info.active) {
    return (
      <StageHero
        direction="(the house is closed.)"
        title={whose}
        lede="This link is switched off. Ask your teacher, or write to me at canberk@actorrise.com."
      />
    );
  }

  let result: string | null = null;
  if (answer) {
    const until = untilLabel(answer.until);
    result = {
      granted: `You're in. Plus is on${until ? ` until ${until}` : ""}, on me.`,
      joined: `You're already in${until ? `, Plus runs until ${until}` : ""}.`,
      already: `You already have Plus${until ? ` until ${until}` : ""}, so nothing changes.`,
      paying: "You're already on a paid plan, so I left it as it is.",
      own_link: "This is your own link. Students who open it get the month.",
      full: "This class is full on my end. Write to me at canberk@actorrise.com and I'll add you by hand.",
    }[answer.outcome] ?? "Done.";
  }

  return (
    <>
      <StageHero
        direction="(the student rush.)"
        title={whose}
        lede={`Sign up and you're on Plus for ${info.days === 30 ? "a month" : `${info.days} days`}, free. No card, no code.`}
      />
      <div className="container mx-auto max-w-2xl px-6 py-12 md:py-16">
        {result ? (
          <>
            <p className="mb-6 text-lg text-foreground">{result}</p>
            <Button onClick={() => router.push("/monologues")}>Find a monologue</Button>
          </>
        ) : loading ? null : user ? (
          <>
            <p className="mb-6 text-muted-foreground">You&rsquo;re signed in as {user.email}.</p>
            <Button onClick={join} disabled={joining}>
              {joining ? "Joining" : "Join the class"}
            </Button>
            {failed && (
              <p className="mt-4 text-sm text-muted-foreground">
                That didn&rsquo;t go through. Try again, or write to me at canberk@actorrise.com.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mb-6 text-muted-foreground">
              Use whatever email you like. Once you&rsquo;re signed up, Plus switches on by itself.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/signup?redirect=/monologues">Sign up</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/login?redirect=/monologues">I already have an account</Link>
              </Button>
            </div>
          </>
        )}
        <p className="mt-10 text-sm text-muted-foreground">
          I&rsquo;m Canberk, an actor. I built ActorRise on my own: a monologue library and a scene
          partner that reads the other lines out loud.
        </p>
      </div>
    </>
  );
}
