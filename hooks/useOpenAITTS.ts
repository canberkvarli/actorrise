'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { API_URL } from '@/lib/api';
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

// ── Hook ──────────────────────────────────────────────────────────────────

interface UseOpenAITTSOptions {
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

interface UseOpenAITTSReturn {
  speak: (text: string, voice?: string, instructions?: string) => Promise<void>;
  cancel: () => void;
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
 *
 * On 403, throws a TTSError with the structured detail from the backend
 * so callers can show an upgrade modal.
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
      audioRef.current.src = '';
      audioRef.current = null;
    }
    // Don't revoke cached URLs — only revoke non-cached ones
    if (ownedUrlRef.current) {
      URL.revokeObjectURL(ownedUrlRef.current);
      ownedUrlRef.current = null;
    }
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  const speak = useCallback(
    async (text: string, voice: string = 'coral', instructions: string = '') => {
      cancel();
      setError(null);

      const key = cacheKey(text, voice, instructions);
      const cached = getCached(key);

      try {
        let audioUrl: string;
        let fromCache = false;

        if (cached) {
          // Cache hit — create a fresh blob URL from the stored blob
          // (the old blobUrl may have been revoked by the audio element)
          audioUrl = URL.createObjectURL(cached.blob);
          ownedUrlRef.current = audioUrl;
          fromCache = true;
        } else {
          // Cache miss — fetch from API
          setIsLoading(true);

          const abortController = new AbortController();
          abortRef.current = abortController;

          const {
            data: { session },
          } = await supabase.auth.getSession();
          const token = session?.access_token;

          const response = await fetch(`${API_URL}/api/speech/synthesize`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ text, voice, instructions, response_format: 'mp3' }),
            signal: abortController.signal,
          });

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
          // Store in cache (cache manages its own blobUrl)
          setCache(key, audioBlob);
          // Create a separate blobUrl for this playback
          audioUrl = URL.createObjectURL(audioBlob);
          ownedUrlRef.current = audioUrl;
          fromCache = false;
        }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

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
          onEnd?.();
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          setIsLoading(false);
          if (ownedUrlRef.current) {
            URL.revokeObjectURL(ownedUrlRef.current);
            ownedUrlRef.current = null;
          }
          // If cached entry failed, evict it and retry without cache
          if (fromCache) {
            _audioCache.delete(key);
          }
          onError?.(new Error('Audio playback failed'));
        };

        await audio.play();
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setIsLoading(false);
        setIsSpeaking(false);
        const msg = err instanceof Error ? err.message : 'TTS failed';
        setError(msg);
        onError?.(err);
      }
    },
    [cancel, onEnd, onError],
  );

  return { speak, cancel, isSpeaking, isLoading, error, audioElementRef: audioRef };
}
