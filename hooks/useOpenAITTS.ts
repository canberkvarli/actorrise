'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { API_URL } from '@/lib/api';
import { takePrimedAudio, unlockElement } from '@/lib/primed-audio';
import { supabase } from '@/lib/supabase';

/** Error with HTTP status and structured detail from the backend. */
export class TTSError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    const msg =
      detail && typeof detail === 'object' && 'message' in detail
        ? (detail as { message: string }).message
        : `TTS request failed: ${status}`;
    super(msg);
    this.name = 'TTSError';
    this.status = status;
    this.detail = detail;
  }
}

// ── Preload concurrency limiter ───────────────────────────────────────────
// Limits parallel preload fetches so they don't saturate the connection and
// starve actual speak() requests. speak() bypasses this queue entirely.
const MAX_CONCURRENT_PRELOADS = 2;
let _activePreloads = 0;
const _preloadQueue: Array<() => void> = [];

function enqueuePreload(): Promise<void> {
  if (_activePreloads < MAX_CONCURRENT_PRELOADS) {
    _activePreloads++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    _preloadQueue.push(() => { _activePreloads++; resolve(); });
  });
}

function releasePreload(): void {
  _activePreloads--;
  const next = _preloadQueue.shift();
  if (next) next();
}

// ── Client-side audio blob cache ──────────────────────────────────────────
// Keyed by "text|voice|instructions". Survives across hook instances within
// the same page load. Entries auto-expire after 10 minutes.
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  blobUrl: string;
  blob: Blob;
  createdAt: number;
}

const _audioCache = new Map<string, CacheEntry>();

function cacheKey(text: string, voice: string, instructions: string): string {
  return `${text}|${voice}|${instructions}`;
}

function getCached(key: string): CacheEntry | null {
  const entry = _audioCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    URL.revokeObjectURL(entry.blobUrl);
    _audioCache.delete(key);
    return null;
  }
  return entry;
}

function setCache(key: string, blob: Blob): string {
  // Evict expired entries
  for (const [k, v] of _audioCache) {
    if (Date.now() - v.createdAt > CACHE_TTL_MS) {
      URL.revokeObjectURL(v.blobUrl);
      _audioCache.delete(k);
    }
  }
  // Cap at 50 entries
  if (_audioCache.size >= 50) {
    const oldest = _audioCache.keys().next().value!;
    const entry = _audioCache.get(oldest);
    if (entry) URL.revokeObjectURL(entry.blobUrl);
    _audioCache.delete(oldest);
  }
  const blobUrl = URL.createObjectURL(blob);
  _audioCache.set(key, { blobUrl, blob, createdAt: Date.now() });
  return blobUrl;
}

// ── iOS audio unlock ───────────────────────────────────────────────────────
// iOS Safari blocks programmatic audio.play() unless audio was first started
// from a user gesture. Playing a tiny silent clip on the SAME element during a
// gesture (the "Begin" tap) unlocks it for the rest of the session — provided
// we then REUSE that element for every line (a fresh `new Audio()` re-locks).
// The clip and the unlock live in lib/primed-audio, because the hub's Answer
// tap needs them a route before this hook exists.

// ── Hook ──────────────────────────────────────────────────────────────────

interface UseOpenAITTSOptions {
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

interface UseOpenAITTSReturn {
  speak: (text: string, voice?: string, instructions?: string) => Promise<void>;
  preload: (text: string, voice?: string, instructions?: string) => Promise<void>;
  cancel: () => void;
  /** Unlock audio for iOS — call from a user gesture (e.g. the Begin tap). */
  unlock: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
  error: string | null;
  /** Ref to the underlying HTMLAudioElement (null when not playing). */
  audioElementRef: React.RefObject<HTMLAudioElement | null>;
}

/**
 * Hook for OpenAI gpt-4o-mini-tts via backend /api/speech/synthesize.
 *
 * Fetches an audio blob from the backend and plays it. Client-side cache
 * avoids repeat API calls for the same text+voice+instructions combo.
 */
export function useOpenAITTS(options: UseOpenAITTSOptions = {}): UseOpenAITTSReturn {
  const { onEnd, onError } = options;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Track non-cached object URLs so we can revoke them (cached ones are managed by the cache)
  const ownedUrlRef = useRef<string | null>(null);

  // Store callbacks in refs to always call the latest version
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (ownedUrlRef.current) {
        URL.revokeObjectURL(ownedUrlRef.current);
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.onplay = null;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      // Keep the element (don't null it) so an iOS gesture-unlock persists across
      // lines. A fresh `new Audio()` per line would re-lock playback on iOS.
    }
    // Don't revoke cached URLs — only revoke non-cached ones
    if (ownedUrlRef.current) {
      URL.revokeObjectURL(ownedUrlRef.current);
      ownedUrlRef.current = null;
    }
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  /** Lazily create the single persistent audio element reused for every line. */
  const ensureAudioEl = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      // One a tap already unlocked, if the actor came from the hub's Answer.
      const a = takePrimedAudio() ?? new Audio();
      a.preload = 'auto';
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  /** Unlock audio playback on iOS. MUST run inside a user gesture (Begin tap). */
  const unlock = useCallback(() => {
    unlockElement(ensureAudioEl());
  }, [ensureAudioEl]);

  /** Fetch audio blob (from cache or API). Does NOT play it. */
  const fetchAudioBlob = useCallback(async (
    text: string,
    voice: string,
    instructions: string,
    signal?: AbortSignal
  ): Promise<Blob> => {
    const key = cacheKey(text, voice, instructions);
    const cached = getCached(key);
    if (cached) return cached.blob;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    // Hard timeout so a stalled cellular request fails fast into recovery
    // instead of hanging the rehearsal at "Waiting" forever.
    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), 12000);
    if (signal) {
      if (signal.aborted) timeoutCtrl.abort();
      else signal.addEventListener('abort', () => timeoutCtrl.abort(), { once: true });
    }
    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/speech/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: text.slice(0, 4096), voice, instructions: instructions.slice(0, 2000), response_format: 'mp3' }),
        signal: timeoutCtrl.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let detail: unknown = null;
      try {
        detail = await response.json();
      } catch {
        // body not JSON
      }
      const nested = detail && typeof detail === "object" && "detail" in detail ? (detail as Record<string, unknown>).detail : detail;
      throw new TTSError(response.status, nested ?? detail);
    }

    const audioBlob = await response.blob();
    setCache(key, audioBlob);
    return audioBlob;
  }, []);

  /** Preload audio into cache without playing. Failures are silent.
   *  Concurrency-limited so preloads don't starve speak() requests. */
  const preload = useCallback(
    async (text: string, voice: string = 'coral', instructions: string = '') => {
      const key = cacheKey(text, voice, instructions);
      if (getCached(key)) return; // Already cached
      await enqueuePreload();
      try {
        await fetchAudioBlob(text, voice, instructions);
      } catch {
        // Preload failures are silent
      } finally {
        releasePreload();
      }
    },
    [fetchAudioBlob],
  );

  const speak = useCallback(
    async (text: string, voice: string = 'coral', instructions: string = '') => {
      cancel();
      setError(null);

      const key = cacheKey(text, voice, instructions);

      try {
        const alreadyCached = !!getCached(key);
        if (!alreadyCached) setIsLoading(true);

        const abortController = new AbortController();
        abortRef.current = abortController;

        const audioBlob = await fetchAudioBlob(text, voice, instructions, abortController.signal);
        const audioUrl = URL.createObjectURL(audioBlob);
        ownedUrlRef.current = audioUrl;

        const audio = ensureAudioEl();
        /* Never inherit a mute. The element may have been handed over mid
           unlock (lib/primed-audio mutes it to play a silent clip inside the
           tap), and a muted element still fires `onplay` — so the scene
           reported the partner as speaking while the actor heard nothing. */
        audio.muted = false;
        audio.src = audioUrl;

        audio.onplay = () => {
          setIsSpeaking(true);
          setIsLoading(false);
        };

        audio.onended = () => {
          setIsSpeaking(false);
          if (ownedUrlRef.current) {
            URL.revokeObjectURL(ownedUrlRef.current);
            ownedUrlRef.current = null;
          }
          onEndRef.current?.();
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          setIsLoading(false);
          if (ownedUrlRef.current) {
            URL.revokeObjectURL(ownedUrlRef.current);
            ownedUrlRef.current = null;
          }
          // If cached entry failed, evict it
          if (alreadyCached) {
            _audioCache.delete(key);
          }
          onErrorRef.current?.(new Error('Audio playback failed'));
        };

        await audio.play();
      } catch (err: unknown) {
        setIsLoading(false);
        setIsSpeaking(false);
        if (err instanceof Error && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'TTS failed';
        setError(msg);
        onErrorRef.current?.(err);
      }
    },
    [cancel, fetchAudioBlob, ensureAudioEl],
  );

  return { speak, preload, cancel, unlock, isSpeaking, isLoading, error, audioElementRef: audioRef };
}
