/**
 * Which one-line fix the dead-mic stop shows: from the browser it is in and
 * whether the browser says the microphone is blocked. A blocked mic needs the
 * permission turned on, said where that switch is in this browser; a mic that
 * is allowed and still heard nothing is the wrong input or something else
 * holding it.
 */
export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown';
export type MicBrowser = 'ios_safari' | 'ios_chrome' | 'android' | 'chrome' | 'safari' | 'firefox' | 'other';

export type MicFixKey =
  | 'micFixIosSafari' | 'micFixIosChrome' | 'micFixAndroid' | 'micFixChrome' | 'micFixSafari' | 'micFixFirefox'
  | 'micFixBlocked' | 'micFixPhone' | 'micFixDesktop';

export function micBrowser(ua: string): MicBrowser {
  if (/iPhone|iPad|iPod/.test(ua)) return /CriOS/.test(ua) ? 'ios_chrome' : 'ios_safari';
  if (/Android/.test(ua)) return 'android';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

const BLOCKED: Record<MicBrowser, MicFixKey> = {
  ios_safari: 'micFixIosSafari', ios_chrome: 'micFixIosChrome', android: 'micFixAndroid',
  chrome: 'micFixChrome', safari: 'micFixSafari', firefox: 'micFixFirefox', other: 'micFixBlocked',
};

export function micFix(browser: MicBrowser, permission: MicPermission): MicFixKey {
  if (permission === 'denied') return BLOCKED[browser];
  return browser === 'ios_safari' || browser === 'ios_chrome' || browser === 'android' ? 'micFixPhone' : 'micFixDesktop';
}

/** What the browser says about the microphone, or `unknown` where it will not say (older Safari). */
export async function micPermission(): Promise<MicPermission> {
  try {
    const s = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return s.state;
  } catch {
    return 'unknown';
  }
}
