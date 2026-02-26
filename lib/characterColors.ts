/**
 * Character color system for visual distinction between characters
 * Uses accessible blue/amber palette that works in light and dark themes
 */

export const CHARACTER_COLORS = {
  char1: {
    light: {
      bg: "bg-blue-100",
      text: "text-blue-900",
      border: "border-blue-300",
      ring: "ring-blue-400",
      hex: "#3B82F6",
      bgRaw: "#DBEAFE",
    },
    dark: {
      bg: "bg-blue-950",
      text: "text-blue-100",
      border: "border-blue-800",
      ring: "ring-blue-600",
      hex: "#60A5FA",
      bgRaw: "#172554",
    },
  },
  char2: {
    light: {
      bg: "bg-amber-100",
      text: "text-amber-900",
      border: "border-amber-300",
      ring: "ring-amber-400",
      hex: "#F59E0B",
      bgRaw: "#FEF3C7",
    },
    dark: {
      bg: "bg-amber-950",
      text: "text-amber-100",
      border: "border-amber-800",
      ring: "ring-amber-600",
      hex: "#FBBF24",
      bgRaw: "#451A03",
    },
  },
} as const;

/**
 * Get character colors for a scene based on current theme
 * Returns Tailwind classes for both characters
 */
export function getCharacterColors(isDark: boolean = false) {
  const theme = isDark ? "dark" : "light";

  return {
    char1: CHARACTER_COLORS.char1[theme],
    char2: CHARACTER_COLORS.char2[theme],
  };
}

/**
 * Get color for a specific character by index (0-based)
 */
export function getCharacterColorByIndex(index: number, isDark: boolean = false) {
  if (index === 0) return getCharacterColors(isDark).char1;
  if (index === 1) return getCharacterColors(isDark).char2;
  // Fallback for additional characters (though scenes are 2-person only)
  return getCharacterColors(isDark).char1;
}
