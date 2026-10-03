import { describe, it, expect } from "vitest";
import {
  ttsText,
  ttsInstructions,
  sceneVoiceContext,
  DEFAULT_VOICE,
} from "./scene-voice";

const late = {
  title: "Late",
  play_title: null,
  description: "Riley has been waiting outside the theatre for twenty minutes.",
};

describe("ttsText — the words only", () => {
  it("drops parenthesised and bracketed directions", () => {
    expect(ttsText({ text: "(sighing) You're late. [turns away]" })).toBe("You're late.");
  });

  it("leaves a plain line untouched", () => {
    expect(ttsText({ text: "You're late." })).toBe("You're late.");
  });

  it("collapses the gap a removed direction leaves behind", () => {
    expect(ttsText({ text: "You're (quietly) late." })).toBe("You're late.");
  });
});

describe("ttsInstructions — the voice acts, it does not read aloud", () => {
  it("carries a field stage direction into the instruction", () => {
    const got = ttsInstructions({ text: "You're late.", stage_direction: "sharply" });
    expect(got).toContain("Stage direction: sharply");
  });

  it("picks up an inline direction from the line itself", () => {
    const got = ttsInstructions({ text: "(sighing) You're late." });
    expect(got).toContain("Stage direction: sighing");
  });

  it("does not repeat a direction written in both places", () => {
    // Scoped to the directions segment: the boilerplate guidance that follows
    // uses "sighing" as its worked example, so counting the whole string counts
    // that too. (It does, and this assertion said so before it was narrowed.)
    const got = ttsInstructions({ text: "(sighing) You're late.", stage_direction: "sighing" });
    const segment = got.slice(got.indexOf("Stage direction:"), got.indexOf("Fully embody"));
    expect(segment.match(/sighing/g)?.length).toBe(1);
  });

  it("falls back to a generic frame with no scene context", () => {
    expect(ttsInstructions({ text: "You're late." })).toContain(
      "You are a skilled actor performing a scene.",
    );
  });
});

describe("sceneVoiceContext", () => {
  it("names the character and the scene", () => {
    expect(sceneVoiceContext(late, "RILEY")).toContain('You are RILEY, a character in "Late"');
  });

  it("is empty until both the scene and the character are known", () => {
    expect(sceneVoiceContext(late, null)).toBe("");
    expect(sceneVoiceContext(null, "RILEY")).toBe("");
  });

  it("truncates a long description rather than sending the whole scene", () => {
    const long = { ...late, description: "x".repeat(400) };
    expect(sceneVoiceContext(long, "RILEY")).toContain("x".repeat(150));
    expect(sceneVoiceContext(long, "RILEY")).not.toContain("x".repeat(151));
  });
});

describe("the hub and the player must agree, or the preload is wasted", () => {
  it("produces a byte-identical cache key from the same inputs", () => {
    // The hub computes these from the scene it fetched; the rehearse page
    // computes them from the scene it fetched. Same module, same answer — that
    // is the whole reason warming the line from the hub works.
    const line = { text: "(sharply) You're late.", stage_direction: null, character_name: "RILEY" };
    const context = sceneVoiceContext(late, "RILEY");

    const fromHub = [ttsText(line), DEFAULT_VOICE, ttsInstructions(line, context)].join("|");
    const fromPlayer = [ttsText(line), DEFAULT_VOICE, ttsInstructions(line, context)].join("|");

    expect(fromHub).toBe(fromPlayer);
    expect(fromHub).toContain("You're late.");
    expect(fromHub).toContain("sharply");
  });

  it("pins the guided voice, which is what makes warming possible at all", () => {
    // The guided session never sets ai_voice_id and carries no voice in the
    // URL, so Riley is always this. If that stops being true the preload
    // silently stops hitting and the 3-4s wait comes back.
    expect(DEFAULT_VOICE).toBe("coral");
  });
});
