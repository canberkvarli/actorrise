import { describe, it, expect } from "vitest";
import { resultPoster, isCrossShelf, shelfLabel } from "./resultPoster";

describe("resultPoster", () => {
  it("shows the poster a TV row carries even on the Plays tab", () => {
    // The Game of Thrones case: cross-tab recovery returns TV rows while the
    // actor is on Plays, and the old tab gate dropped the poster.
    const got = { poster_url: "https://img/got.jpg", source_type: "tv" };
    expect(resultPoster(got)).toBe("https://img/got.jpg");
  });

  it("shows nothing for a stage row, which never has one", () => {
    expect(resultPoster({ poster_url: null, source_type: "play" })).toBeNull();
    expect(resultPoster({ source_type: "play" })).toBeNull();
  });

  it("treats an empty or whitespace url as no poster", () => {
    expect(resultPoster({ poster_url: "" })).toBeNull();
    expect(resultPoster({ poster_url: "   " })).toBeNull();
  });

  it("does not care which tab it is rendered under", () => {
    const row = { poster_url: "https://img/x.jpg", source_type: "film" };
    // No mode argument exists any more, which is the point of the change.
    expect(resultPoster(row)).toBe("https://img/x.jpg");
  });
});

describe("isCrossShelf", () => {
  it("is true for a TV row shown on the Plays tab", () => {
    expect(isCrossShelf({ source_type: "tv" }, "plays")).toBe(true);
  });

  it("is true for a play shown on the Film & TV tab", () => {
    expect(isCrossShelf({ source_type: "play" }, "film_tv")).toBe(true);
  });

  it("is false when the row matches the shelf", () => {
    expect(isCrossShelf({ source_type: "play" }, "plays")).toBe(false);
    expect(isCrossShelf({ source_type: "tv" }, "film_tv")).toBe(false);
    expect(isCrossShelf({ source_type: "film" }, "film_tv")).toBe(false);
  });

  it("is false when either side is unknown, rather than guessing", () => {
    expect(isCrossShelf({ source_type: null }, "plays")).toBe(false);
    expect(isCrossShelf({ source_type: "tv" }, undefined)).toBe(false);
  });
});

describe("shelfLabel", () => {
  it("names the row's own medium", () => {
    expect(shelfLabel({ source_type: "film" })).toBe("film");
    expect(shelfLabel({ source_type: "tv" })).toBe("tv");
    expect(shelfLabel({ source_type: "play" })).toBe("play");
  });

  it("returns null for an unknown medium", () => {
    expect(shelfLabel({ source_type: "" })).toBeNull();
    expect(shelfLabel({})).toBeNull();
  });
});
