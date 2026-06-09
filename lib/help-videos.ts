/**
 * Short in-app tutorial videos shown on /help and in contextual spots
 * (e.g. the Practice empty state).
 *
 * Each entry is just metadata + an optional YouTube ID:
 *   - `youtubeId` present  -> the video is ready and plays.
 *   - `youtubeId` omitted  -> renders as a greyed "Coming soon" card.
 *
 * To publish a new video, paste its YouTube ID into the matching entry.
 * No other change needed; the card flips from greyed to playable.
 */

export interface HelpVideo {
  slug: string;
  title: string;
  description: string;
  /** Human label like "1:00". Shown on the card / player. */
  durationLabel: string;
  /** Unlisted/public YouTube ID. Omit until the video is filmed. */
  youtubeId?: string;
}

export const HELP_VIDEOS: HelpVideo[] = [
  {
    slug: "run-your-first-scene",
    title: "Run your first scene",
    description:
      "Paste a scene, pick your character, and let your partner read every other line back.",
    durationLabel: "1:30",
    youtubeId: "TTZxo3bZPI4", // existing ScenePartner demo
  },
  {
    slug: "getting-started",
    title: "Getting started",
    description: "A quick tour of where everything lives and how to get going.",
    durationLabel: "1:30",
  },
  {
    slug: "upload-a-script",
    title: "Upload a script",
    description:
      "Drop in a sides PDF and rehearse the scenes pulled straight out of it.",
    durationLabel: "1:00",
  },
  {
    slug: "pick-character-and-pacing",
    title: "Pick your character and pacing",
    description:
      "Choose the role you're reading and set how fast your partner runs the lines.",
    durationLabel: "0:45",
  },
  {
    slug: "claim-founding-spot",
    title: "Claim your founding spot",
    description:
      "Where the FOUNDER code goes at checkout, and what actually gets charged.",
    durationLabel: "0:45",
  },
];

/** The demo used by contextual embeds (e.g. the Practice empty state). */
export const FIRST_SCENE_VIDEO = HELP_VIDEOS[0];
