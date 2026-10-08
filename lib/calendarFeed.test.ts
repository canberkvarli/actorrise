import { describe, expect, it } from "vitest";

import { CALENDAR_OFFER_KEY, httpsUrl, isApplePlatform, markCalendarOffer, subscribeUrl, takeCalendarOffer, webcalUrl } from "./calendarFeed";

const FEED = "https://api.actorrise.com/api/auditions/calendar.ics?k=abc_123-XYZ";

describe("feed urls", () => {
  it("swaps the scheme both ways and leaves the rest alone", () => {
    expect(webcalUrl(FEED)).toBe("webcal://api.actorrise.com/api/auditions/calendar.ics?k=abc_123-XYZ");
    expect(webcalUrl("http://x.test/a.ics")).toBe("webcal://x.test/a.ics");
    expect(webcalUrl("webcal://x.test/a.ics")).toBe("webcal://x.test/a.ics");
    expect(httpsUrl(webcalUrl(FEED))).toBe(FEED);
    expect(httpsUrl(FEED)).toBe(FEED);
  });

  it("apple subscribes to the webcal url", () => {
    expect(subscribeUrl("apple", FEED)).toBe("webcal://api.actorrise.com/api/auditions/calendar.ics?k=abc_123-XYZ");
  });

  it("google gets the webcal url, encoded, as cid", () => {
    const u = new URL(subscribeUrl("google", FEED));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("cid")).toBe(webcalUrl(FEED));
    expect(subscribeUrl("google", FEED)).toContain("cid=webcal%3A%2F%2Fapi.actorrise.com%2Fapi%2Fauditions%2Fcalendar.ics%3Fk%3Dabc_123-XYZ");
  });

  it("outlook gets the https url and a name", () => {
    const u = new URL(subscribeUrl("outlook", FEED));
    expect(u.origin + u.pathname).toBe("https://outlook.live.com/calendar/0/addfromweb");
    expect(u.searchParams.get("url")).toBe(FEED);
    expect(u.searchParams.get("name")).toBe("ActorRise auditions");
    expect(subscribeUrl("outlook", FEED)).toContain("&name=ActorRise%20auditions");
  });
});

function memory() {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  return { m, get: () => s };
}

describe("first-audition calendar offer", () => {
  it("shows once", () => {
    const st = memory();
    markCalendarOffer(42, st.get);
    expect(st.m.get(CALENDAR_OFFER_KEY)).toBe("42");
    expect(takeCalendarOffer(st.get)).toBe(42);
    expect(takeCalendarOffer(st.get)).toBeNull();
  });

  it("ignores junk and survives storage that throws", () => {
    const st = memory();
    st.m.set(CALENDAR_OFFER_KEY, "nope");
    expect(takeCalendarOffer(st.get)).toBeNull();
    const boom = () => { throw new Error("blocked"); };
    expect(takeCalendarOffer(boom)).toBeNull();
    expect(() => markCalendarOffer(1, boom)).not.toThrow();
  });
});

describe("isApplePlatform", () => {
  it("is true on a Mac, an iPhone and an iPad", () => {
    expect(isApplePlatform({ platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" })).toBe(true);
    expect(isApplePlatform({ platform: "iPhone", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe(true);
    expect(isApplePlatform({ userAgentData: { platform: "macOS" } })).toBe(true);
  });
  it("is false on Windows, Android and Linux", () => {
    expect(isApplePlatform({ platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe(false);
    expect(isApplePlatform({ platform: "Linux armv8l", userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" })).toBe(false);
    expect(isApplePlatform({ userAgentData: { platform: "Linux" }, userAgent: "Mozilla/5.0 (X11; Linux x86_64)" })).toBe(false);
  });
  it("shows it when it cannot tell", () => {
    expect(isApplePlatform(undefined)).toBe(true);
    expect(isApplePlatform({})).toBe(true);
  });
});
