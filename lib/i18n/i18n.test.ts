import { describe, expect, it } from "vitest";
import { detectLocale, pickLocale, readLocaleCookie, localeCookieString, TURKISH_ON_WEB } from "./locale";
import { interpolate, translate, translateList } from "./index";

describe("the web is English only", () => {
  it("resolves every visitor to English, a saved Turkish choice included", () => {
    expect(TURKISH_ON_WEB).toBe(false);
    expect(detectLocale({ cookie: "NEXT_LOCALE=tr", languages: ["tr-TR"], timeZone: "Europe/Istanbul" })).toBe("en");
  });
});

describe("pickLocale (the rules when Turkish is on)", () => {
  it("an explicit cookie beats every detected signal", () => {
    expect(pickLocale({ cookie: "a=1; NEXT_LOCALE=en", languages: ["tr-TR"], timeZone: "Europe/Istanbul" })).toBe("en");
    expect(pickLocale({ cookie: "NEXT_LOCALE=tr", languages: ["en-US"], timeZone: "America/Los_Angeles" })).toBe("tr");
  });

  it("a Turkish-first browser gets Turkish anywhere", () => {
    expect(pickLocale({ languages: ["tr-TR", "en"], timeZone: "Europe/Berlin" })).toBe("tr");
    expect(pickLocale({ languages: ["tr"] })).toBe("tr");
  });

  it("only the first language counts", () => {
    expect(pickLocale({ languages: ["en-US", "tr"], timeZone: "Europe/Berlin" })).toBe("en");
  });

  it("Turkish time means Turkish, even on an English browser", () => {
    expect(pickLocale({ languages: ["en-US"], timeZone: "Europe/Istanbul" })).toBe("tr");
  });

  it("falls back to English", () => {
    expect(pickLocale({})).toBe("en");
    expect(pickLocale({ cookie: "NEXT_LOCALE=fr", languages: ["de-DE"], timeZone: "Europe/Berlin" })).toBe("en");
  });

  it("does not match a language that merely starts with tr", () => {
    // there is no such tag today; the guard is that only `tr` and `tr-*` count
    expect(pickLocale({ languages: ["trv"] })).toBe("en");
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
