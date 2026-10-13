/**
 * Fetch and decode partner lines in order, always ahead of the scene.
 * A line that was null at open (cold cache) is polled at 250ms until the
 * server says ready. `onReady(line)` lets the engine resume a beat it was
 * holding for that line.
 *
 * `api.get` throws only on a non-2xx status (`lib/api.ts` `request()`), so
 * the server's 202 "not yet" comes back as a normal result and the poll just
 * goes round again; a real failure throws out to `onFailed`.
 */
import { api } from '@/lib/api';
import type { AudioPlayer } from './audio-player';

export interface LineSource { key: string; url: string | null }

const POLL_MS = 250;

export class LineLoader {
  private order: number[] = [];
  private sources = new Map<number, LineSource>();
  private started = new Set<number>();
  private inflight = 0;
  private stopped = false;
  onReady: ((lineIndex: number) => void) | null = null;
  onFailed: ((lineIndex: number, why: string) => void) | null = null;

  constructor(private player: AudioPlayer, private concurrency = 2) {}

  set(lineIndex: number, src: LineSource) { this.sources.set(lineIndex, src); if (!this.order.includes(lineIndex)) this.order.push(lineIndex); }

  /** Load `firstLine` and set the rest going in order. Resolves when `firstLine` is decoded (or failed). */
  async start(firstLine: number): Promise<void> {
    this.stopped = false;
    const first = this.load(firstLine);
    this.pump();
    await first;
  }

  /** Make sure `lineIndex` and the lines after it are moving. Called on every engine change,
   *  so a jump or back onto a line that was never loaded loads it. */
  ahead(lineIndex: number) { this.pump(lineIndex); }

  /** Start loads for `from` and the lines after it, up to `concurrency` in flight at once. */
  private pump(from = 0) {
    const room = this.concurrency - this.inflight;
    if (room <= 0 || this.stopped) return;
    const pending = this.order.filter(i => i >= from && !this.started.has(i) && !this.player.has(i));
    for (const i of pending.slice(0, room)) void this.load(i);
  }

  private async load(i: number): Promise<void> {
    const src = this.sources.get(i);
    if (!src || this.started.has(i) || this.player.has(i)) return; // no source yet: a later set() still loads it
    this.started.add(i);
    this.inflight++;
    let decoded = false;
    try {
      let url = src.url;
      while (!url && !this.stopped) {
        await new Promise(r => setTimeout(r, POLL_MS));
        const res = await api.get<{ key: string; url: string | null }>(`/api/rehearsal/audio/${src.key}`);
        if (res.status === 200) url = res.data.url;
      }
      if (!url) return; // stopped while polling
      const bytes = await fetch(url).then(r => { if (!r.ok) throw new Error(`audio ${r.status}`); return r.arrayBuffer(); });
      await this.player.decode(i, bytes);
      decoded = true;
    } catch (e) {
      this.started.delete(i);
      this.onFailed?.(i, e instanceof Error ? e.message : String(e));
    } finally {
      this.inflight--;
    }
    if (decoded) { this.onReady?.(i); this.pump(i); }
  }

  /** Stop polling. Lines not yet decoded are forgotten as started, so a later start() loads them again. */
  stop() {
    this.stopped = true;
    for (const i of this.started) if (!this.player.has(i)) this.started.delete(i);
  }
}
