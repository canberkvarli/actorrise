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
  private stopped = false;
  onReady: ((lineIndex: number) => void) | null = null;
  onFailed: ((lineIndex: number, why: string) => void) | null = null;

  constructor(private player: AudioPlayer, private concurrency = 2) {}

  set(lineIndex: number, src: LineSource) { this.sources.set(lineIndex, src); if (!this.order.includes(lineIndex)) this.order.push(lineIndex); }

  /** Load the first `n` lines in order, then keep going. Resolves when line 0 is decoded. */
  async start(firstLine: number): Promise<void> {
    this.stopped = false;
    const first = this.load(firstLine);
    void this.pump();
    await first;
  }

  /** Make sure the lines after `lineIndex` are moving. Called on every handover. */
  ahead(lineIndex: number) { void this.pump(lineIndex); }

  private async pump(from = -1) {
    const pending = this.order.filter(i => i > from && !this.started.has(i) && !this.player.has(i));
    for (const i of pending.slice(0, this.concurrency)) void this.load(i);
  }

  private async load(i: number): Promise<void> {
    if (this.started.has(i) || this.player.has(i)) return;
    this.started.add(i);
    const src = this.sources.get(i);
    if (!src) return;
    try {
      let url = src.url;
      while (!url && !this.stopped) {
        await new Promise(r => setTimeout(r, POLL_MS));
        const res = await api.get<{ key: string; url: string | null }>(`/api/rehearsal/audio/${src.key}`);
        if (res.status === 200) url = res.data.url;
      }
      if (!url) return;
      const bytes = await fetch(url).then(r => { if (!r.ok) throw new Error(`audio ${r.status}`); return r.arrayBuffer(); });
      await this.player.decode(i, bytes);
      this.onReady?.(i);
      void this.pump(i);
    } catch (e) {
      this.started.delete(i);
      this.onFailed?.(i, e instanceof Error ? e.message : String(e));
    }
  }

  stop() { this.stopped = true; }
}
