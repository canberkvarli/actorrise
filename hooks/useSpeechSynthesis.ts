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

  // Load available voices
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);

      // Auto-select a good default voice
      if (!selectedVoice && availableVoices.length > 0) {
        // Try to find an English voice
        const englishVoice = availableVoices.find(v => v.lang.startsWith('en'));
        setSelectedVoice(englishVoice || availableVoices[0]);
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
  }, [isSupported, selectedVoice]);

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

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      setIsSpeaking(false);
      setIsPaused(false);
      if (onError) {
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
