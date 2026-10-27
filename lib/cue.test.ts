import { describe, expect, it } from "vitest";
import { linkify, parseSse } from "./cue";

describe("parseSse", () => {
  it("returns whole frames and keeps the partial one for later", () => {
    const [events, rest] = parseSse(
      'data: {"type":"text","text":"Hi. "}\n\ndata: {"type":"tool","name":"pricing"}\n\ndata: {"type":"te',
    );
    expect(events).toEqual([
      { type: "text", text: "Hi. " },
      { type: "tool", name: "pricing" },
    ]);
    expect(rest).toBe('data: {"type":"te');
  });

  it("carries the capped event the wall opens on", () => {
    const [events] = parseSse('data: {"type":"capped","reason":"free_cap","limit":15}\n\n');
    expect(events[0]).toEqual({ type: "capped", reason: "free_cap", limit: 15 });
  });

  it("drops a frame that is not JSON instead of showing it", () => {
    const [events] = parseSse("data: not json\n\n");
    expect(events).toEqual([]);
  });
});

describe("linkify", () => {
  it("links app paths Cue is allowed to point at", () => {
    expect(linkify("Try /monologue/123 or /practice.")).toEqual([
      { kind: "text", value: "Try " },
      { kind: "link", value: "/monologue/123" },
      { kind: "text", value: " or " },
      { kind: "link", value: "/practice" },
      { kind: "text", value: "." },
    ]);
  });

  it("leaves anything else as text, including full URLs to other sites", () => {
    const text = "See https://example.com/pricing and /admin";
    expect(linkify(text).filter((s) => s.kind === "link").map((s) => s.value)).toEqual(["/pricing"]);
  });
});
