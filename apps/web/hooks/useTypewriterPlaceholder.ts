import { useState, useEffect, useRef, useCallback } from "react";

const TYPING_SPEED = 55; // ms per character
const PAUSE_AFTER_TYPED = 2200; // ms to show full text
const ERASE_SPEED = 30; // ms per character when erasing
const PAUSE_AFTER_ERASE = 400; // ms before typing next

/**
 * Animated typewriter placeholder that cycles through example queries.
 * Returns the current placeholder string and handlers to pause/resume.
 *
 * - Pauses when the user focuses the input or starts typing.
 * - Resumes after `resumeDelayMs` of idle blur (input empty).
 */
export function useTypewriterPlaceholder(
  examples: string[],
  opts?: { resumeDelayMs?: number; enabled?: boolean }
) {
  const { resumeDelayMs = 3000, enabled = true } = opts ?? {};
  const [display, setDisplay] = useState("");
  const [paused, setPaused] = useState(false);
  const indexRef = useRef(0);
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timers
  const clearTimers = useCallback(() => {
    if (rafRef.current != null) { clearTimeout(rafRef.current); rafRef.current = null; }
    if (resumeTimerRef.current != null) { clearTimeout(resumeTimerRef.current); resumeTimerRef.current = null; }
  }, []);

  // Core animation loop
  useEffect(() => {
    if (!enabled || paused || examples.length === 0) {
      setDisplay("");
      return;
    }

    let cancelled = false;
    const text = examples[indexRef.current % examples.length];
    let charIdx = 0;

    function typeNext() {
      if (cancelled) return;
      if (charIdx <= text.length) {
        setDisplay(text.slice(0, charIdx));
        charIdx++;
        rafRef.current = setTimeout(typeNext, TYPING_SPEED);
      } else {
        // Pause with full text visible
        rafRef.current = setTimeout(eraseNext, PAUSE_AFTER_TYPED);
      }
    }

    let eraseIdx = text.length;
    function eraseNext() {
      if (cancelled) return;
      if (eraseIdx >= 0) {
        setDisplay(text.slice(0, eraseIdx));
        eraseIdx--;
        rafRef.current = setTimeout(eraseNext, ERASE_SPEED);
      } else {
        // Move to next example
        indexRef.current = (indexRef.current + 1) % examples.length;
        rafRef.current = setTimeout(() => {
          if (!cancelled) {
            // Trigger re-run by forcing a state update
            setPaused((p) => { /* no-op toggle to re-trigger effect */ return p; });
            // Start typing next — we'll re-enter this effect via the index change
            // Actually, just call typeNext with new text inline
            startNextExample();
          }
        }, PAUSE_AFTER_ERASE);
      }
    }

    function startNextExample() {
      if (cancelled) return;
      const nextText = examples[indexRef.current % examples.length];
      let ci = 0;
      function typeChar() {
        if (cancelled) return;
        if (ci <= nextText.length) {
          setDisplay(nextText.slice(0, ci));
          ci++;
          rafRef.current = setTimeout(typeChar, TYPING_SPEED);
        } else {
          let ei = nextText.length;
          function eraseChar() {
            if (cancelled) return;
            if (ei >= 0) {
              setDisplay(nextText.slice(0, ei));
              ei--;
              rafRef.current = setTimeout(eraseChar, ERASE_SPEED);
            } else {
              indexRef.current = (indexRef.current + 1) % examples.length;
              rafRef.current = setTimeout(startNextExample, PAUSE_AFTER_ERASE);
            }
          }
          rafRef.current = setTimeout(eraseChar, PAUSE_AFTER_TYPED);
        }
      }
      typeChar();
    }

    typeNext();
    return () => { cancelled = true; clearTimers(); };
  }, [enabled, paused, examples, clearTimers]);

  /** Call when user focuses the input — stops the animation and clears text. */
  const pause = useCallback(() => {
    clearTimers();
    setPaused(true);
    setDisplay("");
  }, [clearTimers]);

  /** Call when user blurs the input with empty value — restarts after delay. */
  const scheduleResume = useCallback(() => {
    if (resumeTimerRef.current != null) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setPaused(false);
    }, resumeDelayMs);
  }, [resumeDelayMs]);

  // Cleanup on unmount
  useEffect(() => clearTimers, [clearTimers]);

  return { placeholder: display, pause, scheduleResume, isPaused: paused };
}
