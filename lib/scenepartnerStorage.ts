/**
 * ScenePartner onboarding state (localStorage).
 * Tutorial and audio check are per-device; no backend required.
 */

const KEY_TUTORIAL_SEEN = "scene_partner_tutorial_seen";
const KEY_AUDIO_CHECK_DONE = "scene_partner_audio_check_done";

export function getScenePartnerTutorialSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY_TUTORIAL_SEEN) === "1";
  } catch {
    return false;
  }
}

export function setScenePartnerTutorialSeen(): void {
  try {
    localStorage.setItem(KEY_TUTORIAL_SEEN, "1");
  } catch {
    // ignore
  }
}

export function getScenePartnerAudioCheckDone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY_AUDIO_CHECK_DONE) === "1";
  } catch {
    return false;
  }
}

export function setScenePartnerAudioCheckDone(): void {
  try {
    localStorage.setItem(KEY_AUDIO_CHECK_DONE, "1");
  } catch {
    // ignore
  }
}

/** Rehearsal settings (persisted per device) */
export interface RehearsalSettings {
  pauseBetweenLinesSeconds: number;
  skipMyLineIfSilent: boolean;
  skipAfterSeconds: number;
  countdownSeconds: number;
  useAIVoice: boolean;
  autoAdvanceOnFinish: boolean;
}

const KEY_REHEARSAL_SETTINGS = "scene_partner_rehearsal_settings";
const DEFAULT_REHEARSAL_SETTINGS: RehearsalSettings = {
  pauseBetweenLinesSeconds: 3,
  skipMyLineIfSilent: false,
  skipAfterSeconds: 10,
  countdownSeconds: 3,
  useAIVoice: true,
  autoAdvanceOnFinish: true,
};

export function getRehearsalSettings(): RehearsalSettings {
  if (typeof window === "undefined") return DEFAULT_REHEARSAL_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY_REHEARSAL_SETTINGS);
    if (!raw) return DEFAULT_REHEARSAL_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<RehearsalSettings>;
    return { ...DEFAULT_REHEARSAL_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_REHEARSAL_SETTINGS;
  }
}

export function setRehearsalSettings(settings: Partial<RehearsalSettings>): void {
  try {
    const next = { ...getRehearsalSettings(), ...settings };
    localStorage.setItem(KEY_REHEARSAL_SETTINGS, JSON.stringify(next));
  } catch {
    // ignore
  }
}
