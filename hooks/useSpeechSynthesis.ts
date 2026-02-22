'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Voice {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
}

interface UseSpeechSynthesisOptions {
  voice?: SpeechSynthesisVoice | null;
  rate?: number; // 0.1 to 10 (1 = normal)
  pitch?: number; // 0 to 2 (1 = normal)
  volume?: number; // 0 to 1 (1 = max)
  lang?: string;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

interface UseSpeechSynthesisReturn {
  speak: (text: string) => void;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  setVoice: (voice: SpeechSynthesisVoice | null) => void;
}

/**
 * Hook for browser-native text-to-speech (Web Speech API)
 *
 * FREE - Uses browser's built-in voices
 * Works on all modern browsers
 *
 * @example
 * const { speak, isSpeaking, voices } = useSpeechSynthesis({
 *   rate: 1.0,
 *   pitch: 1.0,
 *   volume: 1.0
 * });
 *
 * speak("Hello, I'm your scene partner!");
 */
export function useSpeechSynthesis(
  options: UseSpeechSynthesisOptions = {}
): UseSpeechSynthesisReturn {
  const {
    rate = 1.0,
    pitch = 1.0,
    volume = 1.0,
    lang = 'en-US',
    onEnd,
    onError,
  } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(options.voice || null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check if Web Speech API is supported
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const filterPreferredVoices = useCallback((list: SpeechSynthesisVoice[]) => {
    const en = list.filter((v) => v.lang.startsWith('en'));
    const preferred = ['Google', 'Microsoft', 'Samantha', 'Daniel', 'Karen', 'Alex', 'Kate', 'Victoria', 'Moira', 'Allison'];
    const score = (v: SpeechSynthesisVoice) => {
      const name = v.name;
      const idx = preferred.findIndex((p) => name.includes(p));
      if (idx >= 0) return preferred.length - idx;
      if (name.includes('Natural') || name.includes('Premium')) return 5;
      if (v.localService === false) return 3;
      return 0;
    };
    const byUri = new Map<string, SpeechSynthesisVoice>();
    en.forEach((v) => {
      const existing = byUri.get(v.voiceURI);
      if (!existing || score(v) > score(existing)) byUri.set(v.voiceURI, v);
    });
    return Array.from(byUri.values())
      .sort((a, b) => score(b) - score(a))
      .slice(0, 24);
  }, []);

  // Load available voices (filtered to best/modern English voices)
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      const filtered = filterPreferredVoices(availableVoices);
      const list = filtered.length > 0 ? filtered : availableVoices.filter((v) => v.lang.startsWith('en'));
      setVoices(list);

      if (!selectedVoice && list.length > 0) {
        setSelectedVoice(list[0]);
      }
    };

    loadVoices();

    // Voices may load asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [isSupported, selectedVoice, filterPreferredVoices]);

  // Monitor speaking state
  useEffect(() => {
    if (!isSupported) return;

    const checkSpeaking = () => {
      setIsSpeaking(window.speechSynthesis.speaking);
      setIsPaused(window.speechSynthesis.paused);
    };

    const interval = setInterval(checkSpeaking, 100);
    return () => clearInterval(interval);
  }, [isSupported]);

  const speak = useCallback((text: string) => {
    if (!isSupported) {
      console.warn('Speech synthesis not supported');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;
    utterance.lang = lang;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      if (onEnd) {
        onEnd();
      }
    };

    utterance.onerror = (event: Event) => {
      const err = (event as SpeechSynthesisErrorEvent).error;
      const isCancelOrInterrupt = err === 'interrupted' || err === 'canceled';
      if (!isCancelOrInterrupt) {
        console.warn('Speech synthesis error:', err, event);
      }
      setIsSpeaking(false);
      setIsPaused(false);
      if (onError && !isCancelOrInterrupt) {
        onError(event);
      }
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [isSupported, rate, pitch, volume, lang, selectedVoice, onEnd, onError]);

  const cancel = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
    }
  }, [isSupported]);

  const pause = useCallback(() => {
    if (isSupported && isSpeaking) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isSupported, isSpeaking]);

  const resume = useCallback(() => {
    if (isSupported && isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, [isSupported, isPaused]);

  const setVoice = useCallback((voice: SpeechSynthesisVoice | null) => {
    setSelectedVoice(voice);
  }, []);

  return {
    speak,
    cancel,
    pause,
    resume,
    isSpeaking,
    isPaused,
    isSupported,
    voices,
    selectedVoice,
    setVoice,
  };
}
