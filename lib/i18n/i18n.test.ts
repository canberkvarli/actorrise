import { describe, expect, it } from "vitest";
import { detectLocale, readLocaleCookie, localeCookieString } from "./locale";
import { interpolate, translate, translateList } from "./index";

describe("detectLocale", () => {
  it("an explicit cookie beats every detected signal", () => {
    expect(detectLocale({ cookie: "a=1; NEXT_LOCALE=en", languages: ["tr-TR"], timeZone: "Europe/Istanbul" })).toBe("en");
    expect(detectLocale({ cookie: "NEXT_LOCALE=tr", languages: ["en-US"], timeZone: "America/Los_Angeles" })).toBe("tr");
  });

  it("a Turkish-first browser gets Turkish anywhere", () => {
    expect(detectLocale({ languages: ["tr-TR", "en"], timeZone: "Europe/Berlin" })).toBe("tr");
    expect(detectLocale({ languages: ["tr"] })).toBe("tr");
  });

  it("only the first language counts", () => {
    expect(detectLocale({ languages: ["en-US", "tr"], timeZone: "Europe/Berlin" })).toBe("en");
  });

  it("Turkish time means Turkish, even on an English browser", () => {
    expect(detectLocale({ languages: ["en-US"], timeZone: "Europe/Istanbul" })).toBe("tr");
  });

  it("falls back to English", () => {
    expect(detectLocale({})).toBe("en");
    expect(detectLocale({ cookie: "NEXT_LOCALE=fr", languages: ["de-DE"], timeZone: "Europe/Berlin" })).toBe("en");
  });

  it("does not match a language that merely starts with tr", () => {
    // there is no such tag today; the guard is that only `tr` and `tr-*` count
    expect(detectLocale({ languages: ["trv"] })).toBe("en");
  });
});

describe("cookie", () => {
  it("round-trips", () => {
    const set = localeCookieString("tr").split(";")[0];
    expect(readLocaleCookie(`x=y; ${set}`)).toBe("tr");
    expect(readLocaleCookie(null)).toBeNull();
  });
});

describe("translate", () => {
  it("looks up each language", () => {
    expect(translate("en", "nav.search")).toBe("Search");
    expect(translate("tr", "nav.search")).toBe("Ara");
  });

  it("interpolates", () => {
    expect(translate("tr", "auth.continueWith", { provider: "Google" })).toBe("Google ile devam et");
    expect(interpolate("{a} and {missing}", { a: 1 })).toBe("1 and {missing}");
  });

  it("returns lists", () => {
    expect(translateList("tr", "search.examplesPlays").length).toBeGreaterThan(0);
  });
});
