"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { IconArrowRight, IconScissors, IconPlayerPlayFilled } from "@tabler/icons-react";

import type { WhatsNext as WhatsNextData } from "@/hooks/useWhatsNext";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";

/**
 * The stage — what the rehearsal room puts in front of you when you walk in.
 *
 * This replaced a header that said "ScenePartner" over a paragraph explaining
 * what ScenePartner is, above a list of files sorted by upload date. All three
 * were talking about the work instead of showing it.
 *
 * The organising rule: always open on a piece of writing. Whatever rung of the
 * ladder an actor is on, the biggest thing under the title is a real line of
 * dialogue set in the typewriter face, indented the way it sits on the page it
 * came from. A progress bar would say more precisely how far along they are and
 * would mean nothing; "More strange than true, I never may believe" puts them
 * back in the scene before they have clicked anything.
 */

/* One entrance, top to bottom, like a light coming up. Everything else on this
   screen is still, because it is opened daily and motion that repeats becomes
   furniture. Deliberately not a whileInView: it is above the fold by
   definition, and waiting for a scroll that never comes would leave it blank. */
const rise = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const, delay: 0.06 + i * 0.055 },
  }),
};

function Line({ line }: { line: { character: string; text: string } }) {
  return (
    <div className="mt-7 border-l border-border/70 pl-5 sm:pl-6">
      <p className="font-typewriter text-[13px] uppercase tracking-[0.16em] text-muted-foreground/80">
        {line.character}
      </p>
      <p className="mt-2 font-typewriter text-lg leading-[1.75] text-foreground/90 text-balance sm:text-xl">
        {line.text}
      </p>
    </div>
  );
}

function Slug({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-typewriter text-[13.5px] uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </p>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mt-3 font-brand text-4xl font-medium leading-[1.03] tracking-tight text-foreground text-balance sm:text-5xl lg:text-6xl">
      {children}
    </h1>
  );
}

const ACTION =
  "group inline-flex items-center gap-2 rounded-md bg-primary px-5 h-11 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90";

export function WhatsNext({ data }: { data: WhatsNextData }) {
  const { rung, script, scene, line, character, progress } = data;

  const sceneSlug = [scene?.act, scene?.scene_number].filter(Boolean).join(" · ");

  /* The rehearse screen runs a session; it does not create one. Sent there
     without ?session= it says "No active rehearsal", and without ?script= its
     Back button falls through to /rehearse — the monologue Collection, which
     has nothing to do with the script you came from. So only an already-open
     session goes straight to the stage. Everything else goes to the scene
     editor, which is where you pick your role and start the session properly. */
  const href =
    rung === "resume" && scene && data.session_id
      ? `/scenes/${scene.id}/rehearse?session=${data.session_id}` +
        (script ? `&script=${script.id}` : "")
      : scene && script
        ? `/practice/${script.id}/scenes/${scene.id}/edit`
        : "#";

  // The label under the title. Says who you are in the scene and where you
  // stopped, in that order, because the role is the part worth remembering.
  const standing = [
    character ? `you ${character}` : null,
    rung === "resume" && progress?.total
      ? `line ${progress.current} of ${progress.total}`
      : progress?.total
        ? `${progress.total} lines`
        : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="flex min-w-0 flex-col">
      <motion.div custom={0} variants={rise} initial="hidden" animate="visible">
        <Slug>
          {rung === "resume"
            ? "where you left off"
            : rung === "start"
              ? "ready when you are"
              : rung === "cut"
                ? "waiting to be cut"
                : "on the house"}
          {sceneSlug ? `  ·  ${sceneSlug}` : ""}
        </Slug>
      </motion.div>

      <motion.div custom={1} variants={rise} initial="hidden" animate="visible">
        <Title>{script?.title ?? "Your first scene"}</Title>
      </motion.div>

      {line && (
        <motion.div custom={2} variants={rise} initial="hidden" animate="visible">
          <Line line={line} />
        </motion.div>
      )}

      {/* The one rung with no line to show, because the scenes it would come
          from do not exist yet. It still sits in the same indented block the
          dialogue uses, or the composition collapses to a title floating over
          empty space and the screen looks broken rather than pending. */}
      {rung === "cut" && (
        <motion.div
          custom={2}
          variants={rise}
          initial="hidden"
          animate="visible"
          className="mt-7 border-l border-dashed border-border/70 pl-5 sm:pl-6"
        >
          <p className="font-typewriter text-[13px] uppercase tracking-[0.16em] text-muted-foreground/80">
            not yet cut
          </p>
          <p className="mt-2 max-w-md font-typewriter text-base leading-[1.75] text-muted-foreground sm:text-lg">
            It&apos;s on the shelf, but nobody has cut it into scenes yet.
          </p>
        </motion.div>
      )}

      <motion.div
        custom={3}
        variants={rise}
        initial="hidden"
        animate="visible"
        className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3"
      >
        {rung === "cut" ? (
          <Link href={`/practice?script=${script?.id}`} className={ACTION}>
            <IconScissors className="h-4 w-4" />
            Cut the scenes
          </Link>
        ) : (
          <Link href={href} className={ACTION}>
            <IconPlayerPlayFilled className="h-3.5 w-3.5" />
            {rung === "resume" ? "Pick it up" : rung === "demo" ? "Read it with me" : "Start it"}
            <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}

        {standing && (
          <span className="font-typewriter text-[13px] text-muted-foreground">{standing}</span>
        )}

        {rung === "demo" && (
          <UploadScriptButton variant="compact">or bring your own</UploadScriptButton>
        )}
      </motion.div>
    </div>
  );
}

/** Nothing on the shelf and no sample seeded. Rare, but it cannot be blank. */
export function NothingYet() {
  return (
    <div className="flex min-w-0 flex-col">
      <Slug>from the top</Slug>
      <Title>
        Your first <em className="italic text-primary">scene</em> starts here.
      </Title>
      <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
        Bring in a script and I&apos;ll read every other role with you.
      </p>
      <div className="mt-8">
        <UploadScriptButton variant="primary">Upload a script</UploadScriptButton>
      </div>
    </div>
  );
}

export default WhatsNext;
