/**
 * What the partner says, and how — in one place, because two places would drift.
 *
 * The TTS cache is keyed on the exact triple `(text, voice, instructions)`. A
 * preload that computes any of the three even slightly differently from the
 * player is not a warm cache, it is a wasted request and a second one at the
 * worst possible moment. These lived as private functions inside the 4,000-line
 * rehearse page; the hub now needs the same answers to warm the first line
 * while the actor reads the invitation, so they move here and both import them.
 *
 * (Copying them to the hub instead was the obvious move and the wrong one. A
 * hand-maintained second copy of a vocabulary is exactly what put `angry` on
 * the wrong side of the search relevance floor for a month.)
 */

export interface VoiceLine {
  text: string;
  stage_direction?: string | null;
  character_name?: string;
}

export interface VoiceScene {
  title?: string | null;
  play_title?: string | null;
  description?: string | null;
}

/**
 * The words only.
 *
 * Bracketed and parenthesised directions come out: the voice ACTS on them (see
 * `ttsInstructions`) rather than reading "parenthesis sighing" aloud.
 */
export function ttsText(line: VoiceLine): string {
  return line.text
    .replace(/\[([^\]]+)\]/g, '')
    .replace(/\(([^)]+)\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Build TTS instructions from stage directions and scene context.
 *  The voice ACTS on directions instead of reading them aloud. */
export function ttsInstructions(line: VoiceLine, sceneContext?: string): string {
  const fieldDir = line.stage_direction?.trim();
  const inlineDirs = [...line.text.matchAll(/\(([^)]+)\)/g)].map(m => m[1].trim());
  const allDirs = [...new Set([fieldDir, ...inlineDirs].filter(Boolean))];
  const base = sceneContext || 'You are a skilled actor performing a scene.';
  // Shared delivery notes so the read feels like a living person mid-conversation,
  // not a flat narrator: real breath, shifting pace, and tonal movement.
  const alive =
    'Sound like a real person in the middle of a conversation, not a narrator. ' +
    'Take a natural breath before you speak. Vary your pace: let some phrases rush out, let others land slowly with a beat of silence. ' +
    'Let your pitch and tone shift with the meaning of each phrase. Never flat, monotone, or robotic. React as if you just heard your partner speak.';
  if (!allDirs.length) {
    return `${base} Deliver this line with emotional truth and full commitment. ${alive}`;
  }
  return `${base} Stage direction: ${allDirs.join('; ')}. Fully embody this — if it says "sighing", actually sigh; "whispering", drop your voice; "angrily", let real frustration through. ${alive}`;
}

/** Who the voice is playing, and where. Empty until both are known. */
export function sceneVoiceContext(
  scene: VoiceScene | null | undefined,
  aiCharacter: string | null | undefined,
): string {
  if (!scene || !aiCharacter) return '';
  const parts = [`You are ${aiCharacter}, a character in "${scene.title}"`];
  if (scene.play_title) parts[0] += ` from "${scene.play_title}"`;
  parts[0] += '.';
  if (scene.description) parts.push(`Scene context: ${scene.description.slice(0, 150)}.`);
  parts.push('You are a skilled actor. React naturally to the emotional stakes. Let pauses breathe. Commit fully.');
  return parts.join(' ');
}

/**
 * The voice a session falls back to.
 *
 * `voiceParam || session.ai_voice_id || DEFAULT_VOICE` in the rehearse page.
 * The guided scene never sets `ai_voice_id` (see backend guided_scene.py) and
 * is reached with no voice in the URL, so Riley is ALWAYS this one — which is
 * what makes warming her first line from the hub possible at all.
 */
export const DEFAULT_VOICE = 'coral';
