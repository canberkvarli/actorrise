"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import s from "./intro.module.css";

const W = 560;
const H = 440;

/**
 * The dark stage each card's scene plays on. The scene is drawn once on a
 * 560 x 440 canvas and scaled to whatever room the dialog gives it, so the
 * timings and cursor targets in intro.module.css are plain pixels.
 */
export function IntroStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width && height) setK(Math.min(width / W, (height - 16) / H));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={s.stage} aria-hidden>
      <div className={s.glow} />
      <div className={s.footLights}>
        {Array.from({ length: 7 }, (_, n) => <span key={n} />)}
      </div>
      <div className={s.canvas} style={{ "--k": k ?? 1, visibility: k === null ? "hidden" : undefined } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}

/** A small copy of the rail's ticket: countdown stub, title, role, one chip. */
function Ticket({
  n,
  unit = "days",
  title,
  role,
  chip,
  gel,
  className = "",
  style,
  open,
}: {
  n: string;
  unit?: string;
  title: string;
  role: string;
  chip: string;
  gel?: boolean;
  className?: string;
  style?: CSSProperties;
  open?: string;
}) {
  return (
    <div className={`${s.tk} ${className}`} style={style}>
      <div className={s.tkStub}>
        <span className={s.tkN}>{n}</span>
        <span className={s.tkUnit}>{unit}</span>
        {open !== undefined && (
          <span className={`${s.tkOpen} ${open} bg-primary text-primary-foreground`}>
            <span className={s.tkN}>{n}</span>
            <span className={s.tkUnit}>{unit}</span>
          </span>
        )}
      </div>
      <div className={s.tkBody}>
        <div className={s.tkTitle}>{title}</div>
        <div className={s.tkMeta}>{role}</div>
        <span className={s.chip} data-tone={gel ? "gel" : undefined}>{chip}</span>
      </div>
    </div>
  );
}

function Cursor({ className }: { className: string }) {
  return <span className={`${s.cursor} ${className}`} />;
}

/** Card 1: a casting email is pasted in, read, and folds into a ticket at the top of the rail. */
export function SceneCapture() {
  return (
    <div className={`${s.scene} ${s.s1}`}>
      <div className={s.cap}>
        <div className={s.capArea}>
          <p className={s.capPlaceholder}>Paste it here. The whole email is fine, signature and all.</p>
          <div className={s.mail}>
            <p><b>From:</b> Dana Reyes Casting</p>
            <p><b>Re:</b> The Lighthouse, callback</p>
            <div className={s.mailGap} />
            <p>Hi! I&apos;d love to see you again for MARA.</p>
            <p>Thursday at 10:30am</p>
            <p>Studio B, 312 W 36th St</p>
            <p>Sides attached, bring a headshot.</p>
            <div className={s.mailGap} />
            <p>Dana</p>
          </div>
        </div>
        <div className={s.reading}>
          <div className={s.readLines}>
            <p className={`${s.readLine} ${s.readLine1}`}>Reading it.</p>
            <p className={`${s.readLine} ${s.readLine2}`}>Finding the date and the room.</p>
          </div>
          <div className={s.track}>
            <span className={`${s.sweep} bg-primary`} />
          </div>
        </div>
        <div className={s.capFoot}>
          <div className={s.capFile}>
            <svg width="12" height="14" viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M1.5 1h6l3 3v9h-9z M7.5 1v3h3 M3.5 7.5h5 M3.5 10h5" strokeLinejoin="round" />
            </svg>
            <span>Drop the PDF, or <u>choose a file</u></span>
          </div>
          <span className={`${s.readIt} bg-primary text-primary-foreground`}>Read it</span>
        </div>
      </div>
      <span className={s.keycap}>⌘V</span>

      <div className={s.rail}>
        <p className={s.dir}>(coming up)</p>
        <div className={s.s1Glow} />
        <div className={s.s1Shift}>
          <Ticket n="9" title="Twelfth Night" role="Viola" chip="audition" style={{ left: 0, top: 176, width: 206 }} />
          <Ticket n="16" title="Proof" role="Catherine" chip="self tape" style={{ left: 0, top: 256, width: 206 }} />
        </div>
        <Ticket n="4" title="The Lighthouse" role="Mara" chip="callback" gel className={s.s1New} />
      </div>

      <Cursor className={s.s1Cursor} />
    </div>
  );
}

function Tick({ className }: { className: string }) {
  return (
    <span className={`${s.tick} ${className}`}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.2 6.3 4.8 8.8 9.8 3.4" />
      </svg>
    </span>
  );
}

/** Card 2: a ticket is picked, its prep room opens, and the three steps tick off. */
export function ScenePrep() {
  return (
    <div className={`${s.scene} ${s.s2}`}>
      <div className={s.s2Rail}>
        <p className={s.dir}>(coming up)</p>
        <Ticket n="4" title="The Lighthouse" role="Mara" chip="callback" gel open={s.s2Stub} className={s.s2Pick} style={{ left: 0, top: 106, width: 196 }} />
        <Ticket n="9" title="Twelfth Night" role="Viola" chip="audition" style={{ left: 0, top: 186, width: 196 }} />
        <Ticket n="16" title="Proof" role="Catherine" chip="self tape" style={{ left: 0, top: 266, width: 196 }} />
      </div>

      <div className={s.room}>
        <div className={s.roomHead}>
          <div className={s.roomN}>
            <span className={s.tkN}>4</span>
            <span className={s.tkUnit}>days</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className={s.roomTitle}>The Lighthouse</div>
            <div className={s.tkMeta} style={{ marginTop: 6 }}>Mara · Thu 10:30 · Studio B</div>
          </div>
        </div>
        <p className={s.roomDir}>(the prep)</p>
        <ul className={s.steps}>
          <li>
            <span className={s.box}><Tick className={s.tick1} /></span>
            <div>
              <div className={s.stepLabel}>Run the sides</div>
              <div className={s.stepSub}>
                you&apos;ve run it{" "}
                <span className={s.roll}>
                  <span className={s.rollCol}>
                    <span><b className={s.rollN}>1</b> time</span>
                    <span><b className={s.rollN}>2</b> times</span>
                    <span><b className={s.rollN}>3</b> times</span>
                  </span>
                </span>
              </div>
            </div>
          </li>
          <li>
            <span className={s.box}><Tick className={s.tick2} /></span>
            <div>
              <div className={s.stepLabel}>Pick your piece</div>
              <div className={s.stepSub}>Helena, A Midsummer Night&apos;s Dream</div>
            </div>
          </li>
          <li>
            <span className={s.box}><Tick className={s.tick3} /></span>
            <div>
              <div className={s.stepLabel}>What you&apos;re bringing</div>
              <div className={s.stepSub}>headshot, résumé, the sides</div>
            </div>
          </li>
        </ul>
      </div>

      <Cursor className={s.s2Cursor} />
    </div>
  );
}

function Envelope({ className }: { className: string }) {
  return (
    <svg className={`${s.env} ${className}`} viewBox="0 0 32 23" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="1" y="1" width="30" height="21" style={{ fill: "var(--i-card)" }} />
      <path d="M1.5 1.8 16 12.5 30.5 1.8" />
    </svg>
  );
}

const DAYS = [
  ["Mon", "9"],
  ["Tue", "10"],
  ["Wed", "11"],
  ["Thu", "12"],
  ["Fri", "13"],
  ["Sat", "14"],
  ["Sun", "15"],
] as const;

/** Card 3: three notes land on the week, the audition arrives from the feed, the morning after asks how it went. */
export function SceneNotes() {
  const col = (i: number) => 24 + (512 / 7) * (i + 0.5);
  return (
    <div className={`${s.scene} ${s.s3}`}>
      <div className={s.cal}>
        <div className={s.calHead}>
          <span className={s.calMonth}>October</span>
          <span className={s.feed}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M10.2 4.6A4.4 4.4 0 0 0 2.3 3.5M1.8 7.4a4.4 4.4 0 0 0 7.9 1.1M2.3 1.2v2.3h2.3M9.7 10.8V8.5H7.4" />
            </svg>
            auditions
          </span>
        </div>
        <div className={s.days}>
          {DAYS.map(([d, n], i) => (
            <div key={d} className={s.day}>
              <div className={s.dayName}>{d}</div>
              <div className={s.dayNum}>{n}</div>
              {i === 0 && <Envelope className={s.env1} />}
              {i === 2 && <Envelope className={s.env2} />}
              {i === 4 && <Envelope className={s.env3} />}
              {i === 3 && (
                <div className={s.event}>
                  <b>Lighthouse</b>
                  <span>10:30</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className={`${s.dir} ${s.when} ${s.when1}`} style={{ left: col(0) + 14 }}>(three days out)</p>
      <p className={`${s.dir} ${s.when} ${s.when2}`} style={{ left: col(2) }}>(the night before)</p>
      <p className={`${s.dir} ${s.when} ${s.when3}`} style={{ left: col(4) + 6 }}>(the morning after)</p>

      <div className={s.note}>
        <p className={s.noteDir}>(the morning after)</p>
        <p className={s.noteTitle}>How did The Lighthouse go?</p>
        <div className={s.answers}>
          <span className={s.answer} style={{ width: 76 }}>Felt good</span>
          <span className={`${s.answer} ${s.s3Tap}`} style={{ width: 104 }}>
            Got a callback
            <span className={`${s.answerOn} bg-primary text-primary-foreground`}>Got a callback</span>
          </span>
          <span className={s.answer} style={{ width: 86 }}>Not this time</span>
        </div>
      </div>

      <Cursor className={s.s3Cursor} />
    </div>
  );
}
