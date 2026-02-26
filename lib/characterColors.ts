/**
 * Character badge styling system.
 *
 * All characters use a clean neutral badge by default.
 * The user's selected character (in rehearsal context) gets a subtle primary accent
 * with a "(You)" label.
 */

export interface CharacterBadgeStyle {
  bg: string;
  text: string;
  border: string;
}

/** Neutral badge for all characters */
const NEUTRAL: CharacterBadgeStyle = {
  bg: "bg-muted",
  text: "text-foreground",
  border: "border-border",
};

/** Highlighted badge for the user's selected character */
const USER_HIGHLIGHT: CharacterBadgeStyle = {
  bg: "bg-primary/10",
  text: "text-primary",
  border: "border-primary/30",
};

/**
 * Get badge classes for a character.
 * @param isUserCharacter - Whether this character is the one the user is playing
 */
export function getCharacterBadgeStyle(isUserCharacter: boolean = false): CharacterBadgeStyle {
  return isUserCharacter ? USER_HIGHLIGHT : NEUTRAL;
}
