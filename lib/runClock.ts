/** 101 -> "1:41". The length an actor reads off a sides page. */
export function runClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}
