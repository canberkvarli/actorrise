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
    const silent = silentAudioUrl();

    /* Already playing real audio? Then it is unlocked by definition, and
       there is nothing to do but damage.
       This runs on every tap of the pause button, and it MUTES the element and
       replaces its src with a silent clip. Doing that to an element that is
       mid-line stops the partner dead and leaves her muted for the next line
       too: "Riley speaking" on screen, silence in the room, and a scene that
       never picks up. The gesture it was spending was already spent. */
    if (!audio.paused && audio.src && audio.src !== silent) return;
    audio.muted = true;
    audio.src = silent;
    const playing = audio.play();

    /* The tidy-up only applies if this element is STILL playing the silent
       clip. It runs a tick or two later, and by then a real line may already
       have been handed to the same element — the whole point of priming it.
       Pausing then would stop the partner mid-word, and unmuting is the
       caller's business once they own it.

       This went wrong the moment the hub started warming the first line.
       Before that, the first speak() waited on a network fetch and this always
       resolved first; with the audio already cached, speak() set its src and
       called play() inside the same beat, and the partner "spoke" muted and
       then stopped. The status said "Riley speaking" and nothing came out. */
    const stillSilent = () => {
      try {
        return audio.src === silent;
      } catch {
        return false;
      }
    };
    const settle = () => {
      if (!stillSilent()) return;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* noop */
      }
      audio.muted = false;
    };

    if (playing && typeof playing.then === "function") {
      playing.then(settle).catch(settle);
    } else {
      settle();
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
