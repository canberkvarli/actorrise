/** One event from POST /api/cue/messages (backend/app/services/cue/agent.py). */
export type CueEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "capped"; reason: "free_cap"; limit: number }
  | { type: "done"; reply: string; handed_off: boolean; conversation_id?: number };

export type CueThread = {
  messages: { role: "user" | "assistant"; content: string }[];
  is_plus: boolean;
  used: number;
  limit: number | null;
  capped: boolean;
};

/** Pull complete `data: ...` frames out of an SSE buffer. Returns [events, rest]. */
export function parseSse(buffer: string): [CueEvent[], string] {
  const events: CueEvent[] = [];
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  for (const frame of frames) {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        events.push(JSON.parse(line.slice(5).trim()) as CueEvent);
      } catch {
        // A frame that doesn't parse is dropped, not shown.
      }
    }
  }
  return [events, rest];
}

export async function sendToCue(text: string, onEvent: (e: CueEvent) => void): Promise<void> {
  // Lazy: ./api pulls in the Supabase client, which the pure helpers here
  // (and their tests) have no use for.
  const { API_URL, getAuthToken } = await import("./api");
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/api/cue/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok || !res.body) throw new Error(`Cue ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const [events, rest] = parseSse(buffer);
    buffer = rest;
    events.forEach(onEvent);
  }
  const [events] = parseSse(buffer + "\n\n");
  events.forEach(onEvent);
}

/** Paths Cue may turn into links. Anything else stays plain text. */
const PATH = /(\/(?:monologues|monologue\/\d+|rehearse|practice|auditions|profile|billing|help|pricing)\b)/g;

export type CueSegment = { kind: "text"; value: string } | { kind: "link"; value: string };

export function linkify(text: string): CueSegment[] {
  const out: CueSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(PATH)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ kind: "text", value: text.slice(last, i) });
    out.push({ kind: "link", value: m[1] });
    last = i + m[1].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}
