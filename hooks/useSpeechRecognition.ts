'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { sinceReset, wordsFromResults } from '@/lib/speechTranscript';

interface UseSpeechRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  onResult?: (transcript: string) => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

interface UseSpeechRecognitionReturn {
  transcript: string;
  isListening: boolean;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  error: string | null;
}

/**
 * Hook for browser-native speech recognition (Web Speech API)
 *
 * FREE - Uses browser's built-in speech recognition
 * Works on Chrome, Edge, Safari (with webkit prefix)
 */
export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    continuous = false,
    interimResults = true,
    lang = 'en-US',
    onResult,
    onEnd,
    onError,
  } = options;

  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  // Every word heard this mic session, and how many of them came before the
  // last reset. See lib/speechTranscript for why it is a count and not a clear.
  const wordsRef = useRef<string[]>([]);
  const resetAtRef = useRef(0);

  // Store callbacks in refs so the recognition instance doesn't need to be
  // recreated when inline arrow functions change identity across renders.
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Check if Web Speech API is supported
  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    if (!isSupported) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    // Initialize speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = lang;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
      let finalPiece = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalPiece += event.results[i][0].transcript + ' ';
      }
      wordsRef.current = wordsFromResults(event.results);
      setTranscript(sinceReset(wordsRef.current, resetAtRef.current));
      if (finalPiece && onResultRef.current) {
        onResultRef.current(finalPiece.trim());
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setError(event.error);
      setIsListening(false);
      if (onErrorRef.current) {
        onErrorRef.current(event.error);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (onEndRef.current) {
        onEndRef.current();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
    // Only recreate recognition when config primitives change, NOT callbacks
  }, [continuous, interimResults, lang, isSupported]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition not supported');
      return;
    }

    if (recognitionRef.current && !isListening) {
      try {
        wordsRef.current = [];
        resetAtRef.current = 0;
        setTranscript('');
        setError(null);
        recognitionRef.current.start();
      } catch (err: any) {
        // Already running — safe to ignore
        if (err?.name === 'InvalidStateError') return;
        console.error('Error starting recognition:', err);
        setError('Failed to start speech recognition');
      }
    }
  }, [isSupported, isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    resetAtRef.current = wordsRef.current.length;
    setTranscript('');
  }, []);

  return {
    transcript,
    isListening,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    error,
  };
}
