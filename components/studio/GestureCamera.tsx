"use client";

/**
 * Do the gesture yourself, into the camera. MediaPipe Pose runs here, in the
 * browser: frames never leave the device and nothing is recorded or sent;
 * only the joints' positions during the four seconds are kept, in memory,
 * and read as Laban effort (lib/studio/motion.ts).
 *
 * The tracker's code and model are fetched from Google's CDNs the first time
 * (about 8 MB); after that the browser caches them.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/events";
import { read } from "@/lib/studio/effort";
import { readMotion, type Frame, type MotionReading, type V3 } from "@/lib/studio/motion";
import { display, EASE } from "./style";

// Pinned to the installed package (package.json) so the code and its wasm always agree.
const VISION_VERSION = "1.1.1";
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const RECORD_MS = 4000;

type Phase = "consent" | "loading" | "framing" | "countdown" | "recording" | "result" | "error";

// The pose landmarks the reading uses.
const L_SHOULDER = 11,
  R_SHOULDER = 12,
  L_WRIST = 15,
  R_WRIST = 16,
  L_HIP = 23,
  R_HIP = 24;
const BONES: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
];

type Landmark = { x: number; y: number; z: number; visibility?: number };
type PoseLandmarkerLike = {
  detectForVideo: (v: HTMLVideoElement, ts: number) => { landmarks: Landmark[][]; worldLandmarks: Landmark[][] };
  close: () => void;
};

/** Tracker space to the stage's: y up, z toward the camera, mirrored so it reads like a mirror. */
const toStage = (l: Landmark): V3 => [-l.x, -l.y, -l.z];

export default function GestureCamera({
  wide,
  onReading,
  onKeepShape,
  onClose,
}: {
  wide: boolean;
  onReading: (r: MotionReading) => void;
  onKeepShape: (r: MotionReading) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("consent");
  const [error, setError] = useState("");
  const [seen, setSeen] = useState(false);
  const [count, setCount] = useState(3);
  const [reading, setReading] = useState<MotionReading | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const tracker = useRef<PoseLandmarkerLike | null>(null);
  const raf = useRef(0);
  const frames = useRef<Frame[]>([]);
  const recording = useRef<{ start: number } | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    tracker.current?.close();
    tracker.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const finish = useCallback(() => {
    recording.current = null;
    const r = readMotion(frames.current);
    setReading(r);
    setPhase("result");
    trackEvent("studio_camera_reading", {
      main: r ? read(r.point).main.id : "none",
      confidence: r ? Math.round(r.confidence * 100) / 100 : 0,
    });
    if (r) onReading(r);
  }, [onReading]);

  const loop = useCallback(() => {
    const v = video.current;
    const c = canvas.current;
    const t = tracker.current;
    if (!v || !c || !t) return;
    if (v.readyState >= 2) {
      const now = performance.now();
      const res = t.detectForVideo(v, now);
      const lm = res.landmarks?.[0];
      const wl = res.worldLandmarks?.[0];
      // Draw the tracked skeleton over the preview.
      const ctx = c.getContext("2d");
      if (ctx) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        ctx.clearRect(0, 0, c.width, c.height);
        if (lm) {
          ctx.lineWidth = 4;
          ctx.strokeStyle = recording.current ? "#ff7a3a" : "rgba(255,226,196,0.85)";
          for (const [a, b] of BONES) {
            ctx.beginPath();
            ctx.moveTo(lm[a].x * c.width, lm[a].y * c.height);
            ctx.lineTo(lm[b].x * c.width, lm[b].y * c.height);
            ctx.stroke();
          }
          ctx.fillStyle = "#ffd2a6";
          for (const i of [L_WRIST, R_WRIST]) {
            ctx.beginPath();
            ctx.arc(lm[i].x * c.width, lm[i].y * c.height, 9, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      const visible =
        !!lm && [L_SHOULDER, R_SHOULDER, L_WRIST, R_WRIST].every((i) => (lm[i].visibility ?? 1) > 0.5);
      if (phaseRef.current === "framing") setSeen(visible);
      if (recording.current && wl) {
        frames.current.push({
          t: (now - recording.current.start) / 1000,
          // MediaPipe's "left" is the person's left; mirrored, it lands on the screen's left too.
          lw: toStage(wl[L_WRIST]),
          rw: toStage(wl[R_WRIST]),
          ls: toStage(wl[L_SHOULDER]),
          rs: toStage(wl[R_SHOULDER]),
          lh: toStage(wl[L_HIP]),
          rh: toStage(wl[R_HIP]),
        });
        if (now - recording.current.start > RECORD_MS) finish();
      }
    }
    raf.current = requestAnimationFrame(loop);
  }, [finish]);

  const start = async () => {
    setPhase("loading");
    trackEvent("studio_camera_opened", {});
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const v = video.current!;
      v.srcObject = stream.current;
      await v.play();
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks(WASM);
      const make = (delegate: "GPU" | "CPU") =>
        PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      tracker.current = (await make("GPU").catch(() => make("CPU"))) as unknown as PoseLandmarkerLike;
      setPhase("framing");
      raf.current = requestAnimationFrame(loop);
    } catch (e) {
      stop();
      const name = (e as { name?: string })?.name;
      setError(
        name === "NotAllowedError"
          ? "The camera wasn't allowed. You can turn it on for this site in the browser's settings."
          : name === "NotFoundError"
            ? "No camera found on this device."
            : "The tracker couldn't start here. Try a recent Chrome or Safari.",
      );
      setPhase("error");
    }
  };

  const go = () => {
    setPhase("countdown");
    setCount(3);
    let n = 3;
    const t = window.setInterval(() => {
      n -= 1;
      setCount(n);
      if (n === 0) {
        window.clearInterval(t);
        frames.current = [];
        recording.current = { start: performance.now() };
        setPhase("recording");
      }
    }, 800);
  };

  const again = () => {
    setReading(null);
    setPhase("framing");
  };

  const close = () => {
    stop();
    onClose();
  };

  const r = reading ? read(reading.point) : null;
  const btn = (primary: boolean) =>
    ({
      fontSize: 12,
      padding: "9px 16px",
      borderRadius: 999,
      border: `1px solid ${primary ? "#CB4B00" : "rgba(243,217,191,0.22)"}`,
      background: primary ? "#CB4B00" : "transparent",
      color: primary ? "#fff6ee" : "#e9d6c4",
      cursor: "pointer",
    }) as const;

  const live = phase !== "consent" && phase !== "error";

  return (
    <div
      role="dialog"
      aria-label="Do it yourself"
      style={{
        position: "absolute",
        zIndex: 8,
        ...(wide
          ? { right: 16, bottom: 16, width: 380 }
          : { left: 0, right: 0, top: 0, width: "100%" }),
        background: "rgba(22, 13, 10, 0.92)",
        border: "1px solid rgba(243, 217, 191, 0.14)",
        borderRadius: wide ? 18 : "0 0 18px 18px",
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        overflow: "hidden",
        animation: `studio-in 420ms ${EASE}`,
      }}
    >
      <div style={{ position: "relative", aspectRatio: "4 / 3", background: "#0d0806", display: live ? "block" : "none" }}>
        <video
          ref={video}
          playsInline
          muted
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
        />
        <canvas
          ref={canvas}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
        />
        {(phase === "countdown" || phase === "recording") && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...display,
              fontSize: phase === "countdown" ? 88 : 22,
              color: "#fff1e4",
              textShadow: "0 2px 20px rgba(0,0,0,0.6)",
            }}
          >
            {phase === "countdown" ? count : <span style={{ alignSelf: "flex-end", marginBottom: 14 }}>Go. Full out.</span>}
          </div>
        )}
        {phase === "recording" && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              height: 3,
              background: "#ff7a3a",
              animation: `cam-fill ${RECORD_MS}ms linear forwards`,
            }}
          />
        )}
        {phase === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#e9d6c4", fontSize: 13 }}>
            Starting the tracker…
          </div>
        )}
      </div>

      <div style={{ padding: "14px 16px 16px", display: "grid", gap: 10 }}>
        {phase === "consent" && (
          <>
            <div style={{ ...display, fontSize: 21 }}>Do it yourself</div>
            <p style={{ fontSize: 13, color: "#e9d6c4", opacity: 0.78, lineHeight: 1.5 }}>
              Do the gesture into the camera, full out, and the Studio reads how you moved. The camera stays on this
              device: nothing is recorded or sent, only your joints are tracked while you move.
            </p>
            <p style={{ fontSize: 12, color: "#e9d6c4", opacity: 0.55, lineHeight: 1.5 }}>
              Prop the phone up and step back until your head, shoulders, arms and hips are in frame.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={start} style={btn(true)}>
                Turn on the camera
              </button>
              <button type="button" onClick={close} style={btn(false)}>
                Not now
              </button>
            </div>
          </>
        )}

        {phase === "error" && (
          <>
            <p style={{ fontSize: 13, color: "#f3e6da", lineHeight: 1.5 }}>{error}</p>
            <button type="button" onClick={close} style={{ ...btn(false), justifySelf: "start" }}>
              Close
            </button>
          </>
        )}

        {phase === "framing" && (
          <>
            <p style={{ fontSize: 13, color: seen ? "#bfe3c4" : "#e9d6c4", lineHeight: 1.5 }}>
              {seen ? "I can see you. Ready when you are." : "Step back until your shoulders, arms and hips are in frame."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={go} disabled={!seen} style={{ ...btn(true), opacity: seen ? 1 : 0.45 }}>
                Record 4 seconds
              </button>
              <button type="button" onClick={close} style={btn(false)}>
                Close
              </button>
            </div>
          </>
        )}

        {(phase === "countdown" || phase === "recording") && (
          <p style={{ fontSize: 13, color: "#e9d6c4", lineHeight: 1.5 }}>Do it once, the whole thing, full out.</p>
        )}

        {phase === "result" && (
          <>
            {r && reading ? (
              <>
                <div className="uppercase tracking-[0.22em] text-[#e9d6c4]" style={{ fontSize: 10, opacity: 0.6 }}>
                  That read as
                </div>
                <div style={{ ...display, fontSize: 26, lineHeight: 1.15 }}>{r.sentence}</div>
                <p style={{ fontSize: 13, color: "#ffd2a6" }}>{r.factors}.</p>
                {reading.confidence < 0.4 && (
                  <p style={{ fontSize: 12, color: "#e9d6c4", opacity: 0.65 }}>
                    Not much movement to read. Go bigger for a clearer reading.
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      trackEvent("studio_camera_shape_kept", {});
                      onKeepShape(reading);
                    }}
                    style={btn(true)}
                  >
                    Put my shape on the stage
                  </button>
                  <button type="button" onClick={again} style={btn(false)}>
                    Again
                  </button>
                  <button type="button" onClick={close} style={btn(false)}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "#f3e6da", lineHeight: 1.5 }}>
                  I couldn&apos;t see enough movement to read. Step back so your arms stay in frame, and go full out.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={again} style={btn(true)}>
                    Again
                  </button>
                  <button type="button" onClick={close} style={btn(false)}>
                    Close
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes cam-fill { from { width: 0%; } to { width: 100%; } }`}</style>
    </div>
  );
}
