/**
 * Decision 2: act on the script. Swipe left to skip, right to go back; on a
 * keyboard Space pauses or resumes (the screen toggles), → skips, ← goes back.
 *
 * A tap is not a gesture here any more: a tap on a line jumps to it (the
 * Stage), and pause is the button in the dock. So the one thing this must
 * guard is a swipe that ends on a line: the browser follows its pointerup
 * with a click, and that click must not also jump. Returns a teardown.
 */
export interface GestureHandlers { pause: () => void; skip: () => void; back: () => void }

const SWIPE_PX = 56;

export function bindGestures(el: HTMLElement, h: GestureHandlers): () => void {
  let startX = 0, startY = 0, swiped = false;
  const down = (e: PointerEvent) => { startX = e.clientX; startY = e.clientY; swiped = false; };
  const up = (e: PointerEvent) => {
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped = true;
      if (dx < 0) h.skip(); else h.back();
    }
  };
  // Capture phase, so the swipe's click is gone before any line sees it.
  const click = (e: MouseEvent) => { if (swiped) { swiped = false; e.stopPropagation(); e.preventDefault(); } };
  const key = (e: KeyboardEvent) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    if (e.code === 'Space') {
      if (t instanceof HTMLButtonElement) return; // Space on a focused button presses that button
      e.preventDefault(); h.pause();
    }
    else if (e.key === 'ArrowRight') h.skip();
    else if (e.key === 'ArrowLeft') h.back();
  };
  // Vertical scrolling stays the browser's; a horizontal swipe reaches pointerup.
  const touchAction = el.style.touchAction;
  el.style.touchAction = 'pan-y';
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('click', click, true);
  window.addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up);
    el.removeEventListener('click', click, true);
    window.removeEventListener('keydown', key);
    el.style.touchAction = touchAction;
  };
}
