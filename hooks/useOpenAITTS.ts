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
}

/**
 * Hook for OpenAI gpt-4o-mini-tts via backend /api/speech/synthesize.
 *
 * Fetches an audio blob from the backend and plays it. Falls back
 * gracefully via onError so the caller can switch to browser TTS.
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
  const objectUrlRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      // Detach handlers BEFORE clearing src so we don't trigger onerror
      audioRef.current.onplay = null;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  const speak = useCallback(
    async (text: string, voice: string = 'coral', instructions: string = '') => {
      cancel();
      setIsLoading(true);
      setError(null);

      try {
        const abortController = new AbortController();
        abortRef.current = abortController;

        // Get auth token
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
        const audioUrl = URL.createObjectURL(audioBlob);
        objectUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onplay = () => {
          setIsSpeaking(true);
          setIsLoading(false);
        };

        audio.onended = () => {
          setIsSpeaking(false);
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
          }
          onEnd?.();
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          setIsLoading(false);
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
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

  return { speak, cancel, isSpeaking, isLoading, error };
}
