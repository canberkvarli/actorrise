/**
 * An audio element that was started inside a tap, kept for whoever plays next.
 *
 * iOS will not play audio from code unless that SAME element was first started
 * by a user gesture. The rehearse page spent its Begin tap on exactly this. But
 * the actor coming from the hub has already tapped once, on Answer, one route
 * earlier: the element that tap could unlock did not exist yet, because the
 * page that owns it had not mounted.
 *
 * So the tap primes one here, in module scope, which a client-side route change
 * leaves alone. useOpenAITTS takes it instead of making its own, and the
 * partner's opening line plays on an element the actor's own tap unlocked.
 *
 * Taken once. A second caller gets nothing and makes its own, as before.
 */

let primed: HTMLAudioElement | null = null;
let silentUrl: string | null = null;

/** 44 bytes of WAV header and no samples: enough to count as playback. */
export function silentAudioUrl(): string {
  if (silentUrl) return silentUrl;
  const bytes = new Uint8Array(44);
  const dv = new DataView(bytes.buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  dv.setUint32(4, 36, true);
  w(8, "WAVE");
  w(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  w(36, "data");
  dv.setUint32(40, 0, true);
  silentUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  return silentUrl;
}

/**
 * Start `audio` silently so later plays from code are allowed.
 * MUST be called synchronously inside a user gesture: anything awaited before
 * it spends the gesture, and then the partner never speaks on an iPhone.
 */
export function unlockElement(audio: HTMLAudioElement): void {
  try {
    audio.muted = true;
    audio.src = silentAudioUrl();
    const playing = audio.play();
    if (playing && typeof playing.then === "function") {
      playing
        .then(() => {
          try {
            audio.pause();
            audio.currentTime = 0;
          } catch {
            /* noop */
          }
          audio.muted = false;
        })
        .catch(() => {
          audio.muted = false;
        });
    } else {
      audio.muted = false;
    }
  } catch {
    audio.muted = false;
  }
}

/** Call first thing inside a tap that leads to a scene. */
export function primeAudio(): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;
  try {
    const audio = new Audio();
    audio.preload = "auto";
    unlockElement(audio);
    primed = audio;
  } catch {
    primed = null;
  }
}

export function takePrimedAudio(): HTMLAudioElement | null {
  const audio = primed;
  primed = null;
  return audio;
}
