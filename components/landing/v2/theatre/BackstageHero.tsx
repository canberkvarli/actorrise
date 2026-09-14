"use client";

import { useEffect, useRef, useState } from "react";
import { TheatreCta } from "./TheatreCta";

/**
 * Act I — backstage. A dark wall of half-remembered lines, one working light,
 * and a spotlight you drag around with the cursor.
 *
 * The wall is printed twice: once dim, once lit, the lit copy masked to a
 * circle that follows the pointer. The bulb hangs on a cord you can grab and
 * swing; let go and it settles on a damped pendulum. Click it without dragging
 * and the ghost light goes out.
 */

const WALL = [
  { t: "To be, or not to be", x: "2%", y: "10%", s: "clamp(20px,3vw,44px)", r: "-6deg" },
  { t: "Words, words, words.", x: "72%", y: "6%", s: "clamp(18px,2.4vw,36px)", r: "4deg" },
  { t: "I have of late lost all my mirth", x: "-4%", y: "24%", s: "clamp(16px,2vw,30px)", r: "-2deg" },
  { t: "People don't do such things!", x: "-6%", y: "40%", s: "clamp(18px,2.6vw,40px)", r: "3deg" },
  { t: "We need new forms.", x: "84%", y: "26%", s: "clamp(20px,3vw,46px)", r: "-8deg" },
  { t: "I am a seagull. No, that's not it.", x: "-8%", y: "58%", s: "clamp(16px,2.2vw,34px)", r: "5deg" },
  { t: "Out, damned spot!", x: "86%", y: "44%", s: "clamp(20px,3.2vw,50px)", r: "2deg" },
  { t: "If we shadows have offended", x: "-4%", y: "76%", s: "clamp(16px,2vw,30px)", r: "-3deg" },
  { t: "Attention must be paid.", x: "84%", y: "62%", s: "clamp(18px,2.6vw,40px)", r: "6deg" },
  { t: "Nothing to be done.", x: "2%", y: "92%", s: "clamp(20px,3vw,44px)", r: "-4deg" },
  { t: "What's past is prologue.", x: "82%", y: "80%", s: "clamp(16px,2.2vw,32px)", r: "3deg" },
  { t: "The rest is silence.", x: "78%", y: "94%", s: "clamp(16px,2vw,30px)", r: "-2deg" },
];

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")";

const LIT_MASK =
  "radial-gradient(circle 300px at var(--sx,50%) var(--sy,42%), black 20%, transparent 100%)";

/* The wall is decoration, and below 640px it crowds the headline off the
   screen, so it is hidden there rather than shrunk. */
function Wall({ lit }: { lit?: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden sm:block"
      style={{
        fontFamily: "var(--t-display)",
        fontStyle: "italic",
        color: lit ? "oklch(0.92 0.06 85)" : "oklch(0.26 0.02 55)",
        opacity: lit ? "var(--lamp,1)" : undefined,
        transition: lit ? "opacity .6s" : undefined,
        WebkitMaskImage: lit ? LIT_MASK : undefined,
        maskImage: lit ? LIT_MASK : undefined,
      }}
    >
      {WALL.map((w) => (
        <span
          key={`${w.t}-${w.x}`}
          className="absolute whitespace-nowrap"
          style={{ left: w.x, top: w.y, fontSize: w.s, transform: `rotate(${w.r})` }}
        >
          {w.t}
        </span>
      ))}
    </div>
  );
}

const DIRECTION_ON = "(backstage. five minutes to places.)";
const DIRECTION_OFF = "(who turned off the ghost light? click it again.)";

export function BackstageHero() {
  const heroRef = useRef<HTMLElement>(null);
  const bulbRef = useRef<HTMLDivElement>(null);
  const [lampOn, setLampOn] = useState(true);
  const lampRef = useRef(true);

  /* Physics live in refs. None of this belongs in React state — it changes
     every frame and nothing renders from it. */
  const spot = useRef({ x: 50, y: 42, tx: 50, ty: 42, auto: true });
  const bulb = useRef({ a: 0, v: 0, drag: false, lastX: 0, moved: 0 });

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      /* Snap: a fixed light, no drift, no swing, no rAF at all. */
      hero.style.setProperty("--sx", "50%");
      hero.style.setProperty("--sy", "42%");
      hero.style.setProperty("--swing", "0deg");
      return;
    }

    let raf = 0;
    const loop = (now: number) => {
      const s = spot.current;
      if (s.auto) {
        const t = now / 1000;
        s.tx = 50 + Math.sin(t * 0.5) * 22;
        s.ty = 42 + Math.cos(t * 0.37) * 14;
      }
      s.x += (s.tx - s.x) * 0.08;
      s.y += (s.ty - s.y) * 0.08;
      hero.style.setProperty("--sx", `${s.x}%`);
      hero.style.setProperty("--sy", `${s.y}%`);

      const b = bulb.current;
      if (!b.drag) {
        b.v += -b.a * 0.012 + Math.sin(now / 1400) * 0.004;
        b.v *= 0.985;
        b.a += b.v;
      }
      hero.style.setProperty("--swing", `${b.a}deg`);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onMove = (e: PointerEvent) => {
      const b = bulb.current;
      if (!b.drag) return;
      const dx = e.clientX - b.lastX;
      b.moved += Math.abs(dx);
      b.a = Math.max(-60, Math.min(60, b.a + dx * 0.35));
      b.v = dx * 0.35;
      b.lastX = e.clientX;
    };
    const onUp = () => {
      const b = bulb.current;
      if (!b.drag) return;
      b.drag = false;
      if (bulbRef.current) bulbRef.current.style.cursor = "grab";
      /* A grab that never travelled is a click: flip the lamp. */
      if (b.moved < 4) {
        lampRef.current = !lampRef.current;
        setLampOn(lampRef.current);
        hero.style.setProperty("--lamp", lampRef.current ? "1" : "0");
      }
    };

    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
    };
  }, []);

  const onHeroMove = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    spot.current.auto = false;
    spot.current.tx = ((e.clientX - r.left) / r.width) * 100;
    spot.current.ty = ((e.clientY - r.top) / r.height) * 100;
  };

  return (
    <section
      id="top"
      ref={heroRef}
      onPointerMove={onHeroMove}
      onPointerLeave={() => {
        spot.current.auto = true;
      }}
      className="relative isolate min-h-screen overflow-hidden"
      style={{ background: "var(--t-ink)", cursor: "crosshair" }}
    >
      <Wall />
      <Wall lit />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle 420px at var(--sx,50%) var(--sy,42%), oklch(0.72 0.17 55 / .28) 0%, oklch(0.72 0.17 55 / .08) 45%, transparent 75%)",
          opacity: "var(--lamp,1)",
          transition: "opacity .6s",
          animation: "t-flicker 9s linear infinite",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ opacity: 0.06, mixBlendMode: "overlay", backgroundImage: GRAIN }}
      />

      {/* The ghost light. Grab it, swing it, click it off. */}
      <div
        ref={bulbRef}
        role="button"
        tabIndex={0}
        aria-pressed={lampOn}
        aria-label={lampOn ? "Turn the ghost light off" : "Turn the ghost light on"}
        onPointerDown={(e) => {
          const b = bulb.current;
          b.drag = true;
          b.moved = 0;
          b.lastX = e.clientX;
          b.v = 0;
          e.currentTarget.style.cursor = "grabbing";
          e.preventDefault();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          lampRef.current = !lampRef.current;
          setLampOn(lampRef.current);
          heroRef.current?.style.setProperty("--lamp", lampRef.current ? "1" : "0");
        }}
        className="absolute left-1/2 top-0 z-[3] cursor-grab select-none touch-none"
        style={{ transformOrigin: "top center", transform: "rotate(var(--swing,0deg))" }}
      >
        <div className="-ml-px flex flex-col items-center">
          <span
            className="block w-0.5"
            style={{
              height: "clamp(120px,22vh,220px)",
              background: "linear-gradient(to bottom, oklch(0.45 0.02 55), oklch(0.30 0.02 55))",
            }}
          />
          <span
            className="block"
            style={{
              width: 22,
              height: 14,
              borderRadius: "4px 4px 2px 2px",
              background: "oklch(0.32 0.02 55)",
            }}
          />
          <span
            className="relative block"
            style={{
              width: 44,
              height: 52,
              borderRadius: "50% 50% 46% 46%",
              background:
                "radial-gradient(circle at 50% 40%, oklch(0.99 0.05 95) 0%, oklch(0.92 0.18 100) 30%, oklch(0.75 0.17 60) 100%)",
              boxShadow:
                "0 0 30px 6px oklch(0.85 0.17 80 / .8), 0 0 90px 30px oklch(0.72 0.17 55 / .35)",
              opacity: "var(--lamp,1)",
              transition: "opacity .4s, box-shadow .4s",
            }}
          />
        </div>
      </div>

      {/* Copy. The dark radial behind it stops the wall fighting the headline. */}
      <div
        className="relative z-[2] mx-auto max-w-[1200px] px-6 pb-20 text-center"
        style={{
          paddingTop: "clamp(240px,40vh,340px)",
          background:
            "radial-gradient(ellipse 55% 60% at 50% 55%, oklch(0.13 0.015 50 / .92) 40%, transparent 100%)",
        }}
      >
        <p className="t-dir t-rise" style={{ color: "var(--t-muted-light)" }}>
          {lampOn ? DIRECTION_ON : DIRECTION_OFF}
        </p>

        <div className="relative mx-auto mt-7 max-w-[1100px]">
          <h1 className="t-h1">
            <span className="t-rise block" style={{ "--t-d": ".1s" } as React.CSSProperties}>
              Stop hunting.
            </span>
            <span
              className="t-rise t-em block"
              style={{ "--t-d": ".25s", color: "var(--t-orange)" } as React.CSSProperties}
            >
              Start rehearsing.
            </span>
          </h1>
        </div>

        <p
          className="t-rise mx-auto mt-9 max-w-[600px]"
          style={
            {
              "--t-d": ".4s",
              fontSize: "clamp(17px,1.4vw,21px)",
              lineHeight: 1.45,
              color: "var(--t-muted-light-3)",
            } as React.CSSProperties
          }
        >
          19,000 monologues from real plays, film and TV. Describe the piece the way
          you&rsquo;d say it to a friend. Then run it with a scene partner who never
          cancels.
        </p>

        <div
          className="t-rise mt-11 flex flex-col items-center gap-[18px]"
          style={{ "--t-d": ".55s" } as React.CSSProperties}
        >
          <TheatreCta />
          <p
            className="m-0 flex flex-wrap justify-center gap-x-3.5 gap-y-1.5"
            style={{
              fontFamily: "var(--t-direction)",
              fontStyle: "italic",
              letterSpacing: ".06em",
              fontSize: 14,
              color: "var(--t-faint-2)",
            }}
          >
            <span>(free to start. no card.)</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <a href="#curtain" className="transition-colors hover:!text-[var(--t-gel)]">
              (on iOS)
            </a>
          </p>
        </div>
      </div>

      {/* Footlights. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0"
        style={{
          height: 3,
          background:
            "linear-gradient(to right, transparent, oklch(0.92 0.18 100) 20%, oklch(0.72 0.17 55) 50%, oklch(0.92 0.18 100) 80%, transparent)",
          boxShadow:
            "0 0 24px 4px oklch(0.72 0.17 55 / .5), 0 -40px 80px 10px oklch(0.72 0.17 55 / .12)",
        }}
      />
    </section>
  );
}
