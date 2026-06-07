"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Optional, fully-local self-recorder. No upload, no AI — record yourself
 *  reading the piece and play it back. Degrades gracefully when the browser
 *  has no MediaRecorder or mic access is denied. */
export function SelfRecorder() {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const urlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Guards the one-shot duration-repair seek so it only runs once per clip.
  const fixedDurationRef = useRef(false);

  // Stop tracks + revoke any object URL on unmount.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const supported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const start = async () => {
    if (!supported) {
      setUnavailable(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        fixedDurationRef.current = false;
        setAudioUrl(url);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setUnavailable(true);
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const reRecord = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setAudioUrl(null);
    void start();
  };

  // ── Duration-bug fix ──────────────────────────────────────────────────
  // MediaRecorder WebM blobs ship without a duration header, so the <audio>
  // element reports duration === Infinity (can't scrub, playback looks cut
  // short). Force the browser to compute the real length by seeking far past
  // the end, then snapping back to 0 once it settles.
  const handleLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!isFinite(audio.duration) && !fixedDurationRef.current) {
      fixedDurationRef.current = true;
      audio.currentTime = 1e101;
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (fixedDurationRef.current && isFinite(audio.duration)) {
      fixedDurationRef.current = false;
      audio.currentTime = 0;
    }
  };

  const baseBtn =
    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {unavailable ? (
        <p className="text-sm text-muted-foreground">
          Mic unavailable on this device.
        </p>
      ) : (
        <>
          {!recording && !audioUrl && (
            <button
              type="button"
              onClick={start}
              className={cn(
                baseBtn,
                "border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              Record yourself
            </button>
          )}

          {recording && (
            <button
              type="button"
              onClick={stop}
              className={cn(
                baseBtn,
                "inline-flex items-center gap-2 border border-primary text-primary hover:bg-primary/10",
              )}
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              Stop
            </button>
          )}

          {audioUrl && !recording && (
            <>
              <audio
                ref={audioRef}
                controls
                src={audioUrl}
                preload="metadata"
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                className="h-9 max-w-full"
              />
              <button
                type="button"
                onClick={reRecord}
                className={cn(
                  baseBtn,
                  "border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                Re-record
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default SelfRecorder;
