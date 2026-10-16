/**
 * The class code a student arrived with on /join/<code>, held until they are
 * signed in. Signup can go through Google and a server callback, so nothing
 * survives in the URL; localStorage does. ClassLinkRedeemer spends it once.
 */

const KEY = "ar_class_code_v1";
const CODE = /^[a-z0-9][a-z0-9-]{2,63}$/;

export function holdClassCode(code: string): void {
  try {
    const c = code.trim().toLowerCase();
    if (CODE.test(c)) window.localStorage.setItem(KEY, c);
  } catch {
    // Blocked storage: the join page's own button still works once signed in.
  }
}

export function heldClassCode(): string | null {
  try {
    const c = window.localStorage.getItem(KEY);
    return c && CODE.test(c) ? c : null;
  } catch {
    return null;
  }
}

export function dropClassCode(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}
