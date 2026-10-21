/** A phone, for the run's purposes: iOS (iPad included, which reports itself as
 *  a Mac with touch points) or Android. Same rule as detectPlatform in
 *  MonologueCueing, which decides tap-by-default from it. */
export function isPhoneUserAgent(ua: string, maxTouchPoints = 0): boolean {
  if (/Android/i.test(ua)) return true;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

/** Ask for the mic inside a tap so the next page inherits a granted
 *  permission. Denied or unavailable is fine: the run falls back to tapping.
 *  The tracks are released at once; only the permission is kept. */
export async function primeMic(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* the room copes */
  }
}
