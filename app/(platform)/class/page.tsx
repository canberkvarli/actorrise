"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { ClassRoster, type ClassStudent } from "@/components/educator/ClassRoster";

/**
 * A teacher's class: who joined through their link and what each student has
 * done. Counts only; what a student searched for stays theirs
 * (services/class_links.class_roster). This page is what a school's class plan
 * buys a teacher beyond the students' Plus: seeing the class work.
 */
export default function ClassPage() {
  const { user, loading } = useAuth();
  const [students, setStudents] = useState<ClassStudent[] | null>(null);
  const [failed, setFailed] = useState(false);
  // The moment the class loaded; "3 days ago" is read against it, not the clock
  // at each render.
  const [now, setNow] = useState(0);
  const isTeacher = user?.account_type === "educator";

  useEffect(() => {
    if (!isTeacher) return;
    let live = true;
    api
      .get<{ students: ClassStudent[] }>("/api/class-links/mine/students")
      .then(({ data }) => {
        if (!live) return;
        setNow(Date.now());
        setStudents(data.students);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [isTeacher]);

  const muted = { color: "var(--t-muted-dark)" } as const;

  return (
    <div
      className={`theatre-tokens ${theatreFontVars} relative mx-auto w-full max-w-[1160px] px-4 pb-32 pt-8 sm:px-5 sm:pt-14`}
      style={{ color: "var(--t-text)" }}
    >
      <h1 className="text-[28px] font-semibold leading-tight sm:text-[34px]">Your class</h1>

      {loading || (isTeacher && students === null && !failed) ? null : !isTeacher ? (
        <p className="mt-3 max-w-[56ch] text-[15px] leading-normal" style={muted}>
          This page is for teacher accounts. If you teach and want your class on ActorRise, email
          canberk@actorrise.com and I&apos;ll set you up.
        </p>
      ) : failed ? (
        <p className="mt-3 text-[15px]" style={muted}>
          That didn&apos;t load. Refresh, or email canberk@actorrise.com and I&apos;ll look.
        </p>
      ) : (students ?? []).length === 0 ? (
        <p className="mt-3 max-w-[56ch] text-[15px] leading-normal" style={muted}>
          Nobody has joined through your link yet. It&apos;s in the{" "}
          <Link href="/monologues" className="font-semibold text-primary underline-offset-4 hover:underline">
            library
          </Link>
          . It works best when the whole class signs up together, in one class period.
        </p>
      ) : (
        <ClassRoster students={students ?? []} now={now} />
      )}
    </div>
  );
}
