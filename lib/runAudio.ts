/**
 * The one audio element "Hear it" plays through, unlocked inside the tap.
 *
 * iOS Safari plays sound only from a gesture. The "Run it" tap happens on the
 * piece page and the read starts on /work a moment later, after a client-side
 * route change, so the play() call itself is outside any gesture. The way
 * through is to play something (a few milliseconds of silence) on an element
 * INSIDE the tap and keep that element: once an element has played from a
 * gesture, Safari lets the same element play again later. The module outlives
 * the route change because Next navigates without reloading the document.
 *
 * Speech synthesis is primed the same way, because it is the fallback when a
 * line's recorded audio is not there in time.
 */

let element: HTMLAudioElement | null = null;
let primedAt = 0;
let silentUrl: string | null = null;

/** 50 ms of 8 kHz mono 8-bit silence as a WAV blob URL. Built, not embedded,
 *  so there is no opaque base64 blob in the bundle to wonder about. */
function silence(): string {
  if (silentUrl) return silentUrl;
  const samples = 400;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, "data");
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128); // 8-bit silence is 128
  silentUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return silentUrl;
}

export function runAudio(): HTMLAudioElement {
  if (!element) {
    element = new Audio();
    element.preload = "auto";
  }
  return element;
}

/** Call synchronously inside a click/tap handler. Never throws. */
export function primeRunAudio(): void {
  if (typeof window === "undefined") return;
  try {
    const el = runAudio();
    el.src = silence();
    void el.play().catch(() => {});
    primedAt = Date.now();
  } catch {
    /* the room falls back to asking for a tap */
  }
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
    }
  } catch {
    /* fallback voice unavailable; recorded audio still works */
  }
}

/** True when a tap primed the audio recently enough that the room can start
 *  the read without asking for another one. */
export function audioRecentlyPrimed(withinMs = 60_000): boolean {
  return primedAt > 0 && Date.now() - primedAt < withinMs;
}
