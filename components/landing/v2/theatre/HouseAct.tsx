"use client";

import Image from "next/image";
import { useState } from "react";
import { SOCIALS, externalProps } from "@/lib/socials";
import { TESTIMONIALS } from "@/data/testimonials";
import { TheatreCta } from "./TheatreCta";
import { useTheatreStats } from "./useTheatreStats";

const YOUTUBE_ID = "TTZxo3bZPI4";


/* The pinned-up look: each notice sits at its own angle and its own height.
   Positional rather than keyed by name, so swapping who is on the wall does
   not mean editing the arrangement. */
const PIN = [
  { rot: "-2.5deg", mt: "0" },
  { rot: "1.5deg", mt: "40px" },
  { rot: "-1deg", mt: "12px" },
];

/**
 * Act III — the house, with the lights on. Cream, dark text, and the only
 * part of the page that is about other people rather than the product.
 *
 * The notices are the real testimonials at full length, not the trimmed
 * versions in the design prototype. The stats are live.
 */
export function HouseAct() {
  const { barRef, searches, monologues, users } = useTheatreStats();
  const [playing, setPlaying] = useState(false);

  /* Other actors only. Canberk speaks once on this page, in the founder note
     directly below — having his testimonial up on the wall as well made the
     section read as one man quoting himself. Needs a headshot, because the
     card is built around one. */
  const notices = TESTIMONIALS.filter((t) => t.image && !t.isFounder).slice(0, PIN.length);

  return (
    <section
      id="house"
      className="relative overflow-hidden px-6 pb-[140px] pt-10"
      style={{ background: "var(--t-cream)", color: "var(--t-text)" }}
    >
      <div className="mx-auto max-w-[1240px]">
        {/* --- Stats ------------------------------------------------------- */}
        <div
          ref={barRef}
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))",
            borderTop: "2px solid var(--t-text)",
            borderBottom: "2px solid var(--t-text)",
          }}
        >
          <Stat value={searches} label="monologues found by actors, so far" divider />
          <Stat value={monologues} plus label="pieces from plays, film and TV" divider inset />
          <Stat value={users} plus label="actors rehearsing with ActorRise" last />
        </div>

        {/* --- Notices ----------------------------------------------------- */}
        <div className="mt-[120px]">
          <p className="t-dir" style={{ color: "var(--t-muted-dark-2)" }}>
            (the notices.)
          </p>
          <h2 className="t-h2 mt-4 max-w-[900px]">
            Real actors.{" "}
            <em className="t-em" style={{ color: "var(--t-orange-deep)" }}>
              Real feedback.
            </em>
          </h2>
          <div
            className="mt-14 grid items-start gap-8"
            style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))" }}
          >
            {notices.map((t, i) => {
              const pin = PIN[i];
              return (
                <figure
                  key={t.name}
                  className="relative m-0 px-6 pb-7 pt-6 transition-[transform,box-shadow] duration-[450ms]"
                  style={{
                    borderRadius: 6,
                    background: "var(--t-paper)",
                    border: "1.5px solid var(--t-text)",
                    boxShadow: "8px 8px 0 var(--t-text)",
                    transform: `rotate(${pin.rot})`,
                    marginTop: pin.mt,
                    transitionTimingFunction: "var(--t-spring)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "rotate(0deg) translateY(-8px) scale(1.02)";
                    e.currentTarget.style.boxShadow = "14px 14px 0 var(--t-orange-deep)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = `rotate(${pin.rot})`;
                    e.currentTarget.style.boxShadow = "8px 8px 0 var(--t-text)";
                  }}
                >
                  {/* A strip of tape. */}
                  <span
                    aria-hidden
                    className="absolute -top-3.5 left-1/2 -ml-[45px]"
                    style={{
                      width: 90,
                      height: 26,
                      background: "oklch(0.92 0.18 100 / .8)",
                      transform: "rotate(-2deg)",
                    }}
                  />
                  <div className="flex items-center gap-3.5">
                    <Image
                      src={t.image as string}
                      alt=""
                      width={64}
                      height={64}
                      className="size-16 shrink-0 rounded-full object-cover object-top"
                      style={{ border: "2px solid var(--t-text)" }}
                    />
                    <figcaption>
                      <p className="m-0 text-[17px] font-bold -tracking-[.01em]">{t.name}</p>
                      <p className="m-0 mt-0.5 text-[13px]" style={{ color: "var(--t-muted-dark)" }}>
                        {t.descriptor}
                      </p>
                    </figcaption>
                  </div>
                  <blockquote
                    className="m-0 mt-[18px]"
                    style={{
                      fontFamily: "var(--t-display)",
                      fontSize: 20,
                      lineHeight: 1.3,
                      color: "oklch(0.22 0.01 45)",
                    }}
                  >
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                </figure>
              );
            })}
          </div>
        </div>

        {/* --- Video ------------------------------------------------------- */}
        <div id="watch" className="mt-[140px]">
          <p className="t-dir text-center" style={{ color: "var(--t-muted-dark-2)" }}>
            (ninety seconds. watch it work.)
          </p>
          <div
            className="relative mx-auto mt-7 max-w-[1000px] overflow-hidden transition-transform duration-500"
            style={{
              borderRadius: 28,
              background: "#000",
              border: "2px solid var(--t-text)",
              boxShadow: "16px 16px 0 var(--t-orange-deep)",
              transform: playing ? "rotate(0deg)" : "rotate(-.6deg)",
              transitionTimingFunction: "var(--t-spring)",
            }}
            onMouseEnter={(e) => {
              if (!playing) e.currentTarget.style.transform = "rotate(0deg) scale(1.01)";
            }}
            onMouseLeave={(e) => {
              if (!playing) e.currentTarget.style.transform = "rotate(-.6deg)";
            }}
          >
            <div className="relative aspect-video">
              {playing ? (
                <iframe
                  className="absolute inset-0 size-full"
                  src={`https://www.youtube.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0&modestbranding=1`}
                  title="ActorRise in ninety seconds"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://img.youtube.com/vi/${YOUTUBE_ID}/maxresdefault.jpg`}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(to top, rgb(0 0 0/.55), transparent 50%)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setPlaying(true)}
                    aria-label="Play the ninety second demo"
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <span
                      className="flex size-[104px] items-center justify-center rounded-full transition-transform duration-[400ms]"
                      style={{
                        background: "var(--t-gel)",
                        boxShadow: "0 20px 60px -10px rgb(0 0 0/.6)",
                        animation: "t-bob 3s ease-in-out infinite",
                      }}
                    >
                      <svg
                        width="40"
                        height="40"
                        viewBox="0 0 24 24"
                        fill="oklch(0.16 0.01 45)"
                        className="ml-1"
                        aria-hidden
                      >
                        <path d="M6 4v16a1 1 0 0 0 1.524.852l13-8a1 1 0 0 0 0-1.704l-13-8A1 1 0 0 0 6 4z" />
                      </svg>
                    </span>
                  </button>
                  <span
                    className="absolute bottom-5 left-6 rounded-full px-3 py-1.5 text-[13px] font-semibold text-white"
                    style={{ background: "rgb(0 0 0/.5)", backdropFilter: "blur(6px)" }}
                  >
                    1:30 · ScenePartner
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* --- A note from the wings --------------------------------------- */}
        <div
          className="mt-[160px] grid items-center gap-12"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))" }}
        >
          <div className="relative justify-self-center">
            <Image
              src="/testimonials/canberk/canberk.jpg"
              alt="Canberk Varli, founder of ActorRise"
              width={380}
              height={475}
              className="block w-[min(100%,380px)] object-cover object-top"
              style={{
                aspectRatio: "4/5",
                borderRadius: "200px 200px 24px 24px",
                border: "2px solid var(--t-text)",
                boxShadow: "12px 12px 0 var(--t-gel)",
              }}
            />
            <span
              className="absolute -right-3 bottom-9 rounded-full px-3.5 py-2"
              style={{
                background: "var(--t-text)",
                color: "var(--t-cream)",
                fontFamily: "var(--t-direction)",
                fontStyle: "italic",
                fontSize: 13,
                letterSpacing: ".06em",
                transform: "rotate(-4deg)",
                animation: "t-wobble 5s ease-in-out infinite",
              }}
            >
              (the founder. also an actor.)
            </span>
          </div>
          <div>
            <p className="t-dir" style={{ color: "var(--t-muted-dark-2)" }}>
              (a note, from the wings.)
            </p>
            <p
              className="m-0 mt-5"
              style={{
                fontFamily: "var(--t-display)",
                fontSize: "clamp(1.6rem,2.6vw,2.4rem)",
                lineHeight: 1.2,
                letterSpacing: "-.01em",
                textWrap: "pretty",
              }}
            >
              I&rsquo;m an actor. I built this because I was spending audition nights
              hunting for a piece instead of working on one. Now I open it, say what I
              need the way I&rsquo;d say it to a friend, and I&rsquo;m rehearsing in a
              minute.{" "}
              <em className="t-em" style={{ color: "var(--t-orange-deep)" }}>
                That&rsquo;s the whole idea.
              </em>
            </p>
            <p className="m-0 mt-6 text-base font-bold">
              Canberk Varli{" "}
              <span className="font-normal" style={{ color: "var(--t-muted-dark)" }}>
                · founder, ActorRise
              </span>
            </p>

            {/* Where to find him.
                The note is the one place on this page Canberk speaks in his own
                voice, so it is the honest place to put the handles: an actor who
                has just read "I built this because I was hunting for a piece" is
                the actor most likely to want to say something back. The footer
                carries no socials at all, and a contact form is not the same
                offer as a name you can DM.

                "i answer" rather than "I'm friendly" on purpose. Claiming the
                trait reads self-conscious; naming the thing you will actually do
                is the version you can keep. */}
            <p className="t-dir mt-7" style={{ color: "var(--t-muted-dark-2)" }}>
              (and if you want to talk, find me anywhere. i answer.)
            </p>
            <div className="mt-3.5 flex flex-wrap items-center gap-x-6 gap-y-3">
              {SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  {...externalProps(href)}
                  className="inline-flex items-center gap-2 text-[15px] transition-colors hover:[color:var(--t-orange-deep)]"
                  style={{ color: "var(--t-muted-dark)" }}
                >
                  <Icon className="h-[17px] w-[17px]" aria-hidden />
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* --- What it costs, in a sentence -------------------------------- */}
        <div
          className="mt-[160px] flex flex-wrap items-center justify-between gap-8 p-12"
          style={{
            borderRadius: 32,
            background: "var(--t-text)",
            color: "var(--t-cream)",
            transform: "rotate(.5deg)",
          }}
        >
          <div className="max-w-[640px]">
            <p
              className="m-0"
              style={{
                fontFamily: "var(--t-display)",
                fontSize: "clamp(2.2rem,4.5vw,4rem)",
                lineHeight: 1,
                letterSpacing: "-.02em",
              }}
            >
              Free to start.{" "}
              <em className="t-em" style={{ color: "var(--t-gel)" }}>
                No card.
              </em>
            </p>
            <p
              className="m-0 mt-3.5 text-[17px] leading-relaxed"
              style={{ color: "var(--t-muted-light-3)" }}
            >
              Five searches a month, free, forever. Plus is $12 a month when you want
              unlimited searches and more time with ScenePartner. Students and teachers
              rehearse free, just email.
            </p>
          </div>
          <TheatreCta size="mid" />
        </div>
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
  plus,
  divider,
  inset,
  last,
}: {
  value: string;
  label: string;
  plus?: boolean;
  divider?: boolean;
  inset?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className="py-8"
      style={{
        paddingRight: last ? 0 : 24,
        paddingLeft: inset ? 24 : last ? 24 : 0,
        borderRight: divider ? "1px solid var(--t-line-light)" : undefined,
      }}
    >
      <p
        className="m-0 tabular-nums"
        style={{
          fontFamily: "var(--t-display)",
          fontSize: "clamp(3rem,6vw,5.5rem)",
          lineHeight: 1,
          letterSpacing: "-.03em",
        }}
      >
        {value}
        {plus && <span style={{ color: "var(--t-orange-deep)" }}>+</span>}
      </p>
      <p className="m-0 mt-2 text-[15px]" style={{ color: "var(--t-muted-dark)" }}>
        {label}
      </p>
    </div>
  );
}
