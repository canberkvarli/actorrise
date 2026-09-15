"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { IconScissors, IconPlayerPlayFilled } from "@tabler/icons-react";

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
    <div className="relative mt-9 pl-7">
      {/* The rule draws itself down the side of the speech as the room opens,
          which is the only motion on this screen after load. */}
      <span aria-hidden className="t-cue-rule" />
      <p className="t-cue-who">{line.character}</p>
      <p className="t-cue-text">
        {line.text}
        <span aria-hidden className="t-cue-caret" />
      </p>
    </div>
  );
}

function Slug({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-slug">{children}</p>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="t-stage-title">{children}</h1>
  );
}

/** The one thing to press in the room. Cream, because it is the lit object on
 *  a dark stage, with the play head in the gel dot. */
const ACTION = "t-stage-action";

function ActionDot({ children }: { children: React.ReactNode }) {
  return (
    <span className="t-stage-action__dot" aria-hidden>
      {children}
    </span>
  );
}

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
          className="mt-9 pl-7"
          style={{ borderLeft: "2px dashed var(--t-line-dark-3)" }}
        >
          <p className="t-cue-who" style={{ color: "var(--t-muted-light)" }}>
            not yet cut
          </p>
          <p className="t-cue-text" style={{ color: "var(--t-muted-light-2)" }}>
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
            Cut the scenes
            <ActionDot>
              <IconScissors className="size-4" />
            </ActionDot>
          </Link>
        ) : (
          <Link href={href} className={ACTION}>
            {rung === "resume" ? "Pick it up" : rung === "demo" ? "Read it with me" : "Start it"}
            <ActionDot>
              <IconPlayerPlayFilled className="size-3.5" />
            </ActionDot>
          </Link>
        )}

        {standing && (
          <span
            style={{ fontFamily: "var(--t-direction)", fontSize: 14, color: "var(--t-muted-light)" }}
          >
            {standing}
          </span>
        )}

        {rung === "demo" && (
          <UploadScriptButton variant="compact" className="t-bring-in">or bring your own</UploadScriptButton>
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
        Your first <em className="italic" style={{ color: "var(--t-gel-ink)" }}>scene</em> starts here.
      </Title>
      <p
        className="mt-6 max-w-[40ch] text-[17px] leading-relaxed"
        style={{ color: "var(--t-muted-light-2)" }}
      >
        Bring in a script and I&apos;ll read every other role with you.
      </p>
      <div className="mt-8">
        <UploadScriptButton variant="primary" className="t-stage-action">Upload a script</UploadScriptButton>
      </div>
    </div>
  );
}

export default WhatsNext;
