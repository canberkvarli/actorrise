/**
 * Decision 2: act on the script. Tap a line to start from it (the Stage does
 * that itself); tap empty space to pause; swipe left to skip, right to go
 * back; Space / → / ← on a keyboard. Returns a teardown.
 */
export interface GestureHandlers { pause: () => void; skip: () => void; back: () => void }

const SWIPE_PX = 56;

export function bindGestures(el: HTMLElement, h: GestureHandlers): () => void {
  let startX = 0, startY = 0, moved = false;
  const down = (e: PointerEvent) => { startX = e.clientX; startY = e.clientY; moved = false; };
  const move = (e: PointerEvent) => { if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) moved = true; };
  const up = (e: PointerEvent) => {
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) h.skip(); else h.back();
      return;
    }
    if (!moved && (e.target as HTMLElement).dataset.pauseTarget !== undefined) h.pause();
  };
  const key = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'Space') { e.preventDefault(); h.pause(); }
    else if (e.key === 'ArrowRight') h.skip();
    else if (e.key === 'ArrowLeft') h.back();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  window.addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up); window.removeEventListener('keydown', key);
  };
}
