'use client';

import { useState, useRef, useCallback } from 'react';

interface UseVideoRecorderOptions {
  onRecordingComplete?: (blob: Blob, url: string) => void;
  onError?: (error: Error) => void;
  timeLimit?: number; // in seconds
}

interface UseVideoRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  recordedBlob: Blob | null;
  recordedUrl: string | null;
  duration: number;
  isSupported: boolean;
  hasCameraPermission: boolean | null;
  isAudioOnly: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  clearRecording: () => void;
  stream: MediaStream | null;
}

/**
 * Hook for video recording using MediaRecorder API
 *
 * FREE - Uses browser's built-in video recording
 * Records video with audio from webcam
 *
 * @example
 * const { startRecording, stopRecording, recordedUrl } = useVideoRecorder({
 *   timeLimit: 120, // 2 minutes
 *   onRecordingComplete: (blob, url) => console.log('Done!', url)
 * });
 */
export function useVideoRecorder(
  options: UseVideoRecorderOptions = {}
): UseVideoRecorderReturn {
  const {
    onRecordingComplete,
    onError,
    timeLimit
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isAudioOnly, setIsAudioOnly] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeLimitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if MediaRecorder is supported
  const isSupported = typeof window !== 'undefined' &&
    'MediaRecorder' in window &&
    'mediaDevices' in navigator;

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      const error = new Error('Video recording not supported in this browser');
      if (onError) onError(error);
      return;
    }

    try {
      let mediaStream: MediaStream;
      let audioOnly = false;

      // First, check camera permission
      try {
        const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        setHasCameraPermission(cameraPermission.state === 'granted');
        
        // Try to get camera and microphone access
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user'
            },
            audio: true
          });
        } catch (videoError: any) {
          // If camera permission is denied, fallback to audio-only
          if (videoError.name === 'NotAllowedError' || videoError.name === 'PermissionDeniedError') {
            console.warn('Camera permission denied, falling back to audio-only recording');
            setHasCameraPermission(false);
            setIsAudioOnly(true);
            audioOnly = true;
            
            // Request audio-only access
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: true
            });
          } else {
            throw videoError;
          }
        }
      } catch (permissionError) {
        // If permissions API is not supported, try direct access
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user'
            },
            audio: true
          });
        } catch (videoError: any) {
          // If camera permission is denied, fallback to audio-only
          if (videoError.name === 'NotAllowedError' || videoError.name === 'PermissionDeniedError') {
            console.warn('Camera permission denied, falling back to audio-only recording');
            setHasCameraPermission(false);
            setIsAudioOnly(true);
            audioOnly = true;
            
            // Request audio-only access
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: true
            });
          } else {
            throw videoError;
          }
        }
      }

      setStream(mediaStream);
      setIsAudioOnly(audioOnly);
      chunksRef.current = [];

      // Create MediaRecorder - use audio mime type if audio-only
      const mimeType = audioOnly 
        ? 'audio/webm' 
        : 'video/webm;codecs=vp9'; // Use VP9 codec if available
      
      const mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: mimeType
      });

      // Capture audioOnly in closure
      const isAudioOnlyRecording = audioOnly;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blobType = isAudioOnlyRecording ? 'audio/webm' : 'video/webm';
        const blob = new Blob(chunksRef.current, { type: blobType });
        const url = URL.createObjectURL(blob);

        setRecordedBlob(blob);
        setRecordedUrl(url);
        setIsRecording(false);
        setIsPaused(false);

        // Stop all tracks and turn off camera/microphone
        mediaStream.getTracks().forEach(track => {
          track.stop();
          // Explicitly stop video tracks to turn off camera
          if (track.kind === 'video') {
            track.stop();
          }
        });
        setStream(null);
        setIsAudioOnly(false);

        // Clear duration interval
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }

        if (onRecordingComplete) {
          onRecordingComplete(blob, url);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        const error = new Error('Recording failed');
        if (onError) onError(error);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms

      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      startTimeRef.current = Date.now();

      // Start duration counter
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);
      }, 100);

      // Set time limit if specified
      if (timeLimit) {
        timeLimitTimeoutRef.current = setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        }, timeLimit * 1000);
      }

    } catch (error) {
      console.error('Error starting recording:', error);
      setIsAudioOnly(false);
      if (onError) onError(error as Error);
    }
  }, [isSupported, timeLimit, onRecordingComplete, onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();

      // Clear timeouts/intervals
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      if (timeLimitTimeoutRef.current) {
        clearTimeout(timeLimitTimeoutRef.current);
        timeLimitTimeoutRef.current = null;
      }
    }
    
    // Also stop all tracks immediately when stopping recording to turn off camera
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        // Explicitly stop video tracks to turn off camera
        if (track.kind === 'video') {
          track.stop();
        }
      });
      setStream(null);
      setIsAudioOnly(false);
    }
  }, [stream]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);

      // Resume duration counter
      startTimeRef.current = Date.now() - (duration * 1000);
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);
      }, 100);
    }
  }, [isRecording, isPaused, duration]);

  const clearRecording = useCallback(() => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    setRecordedBlob(null);
    setRecordedUrl(null);
    setDuration(0);
    chunksRef.current = [];
  }, [recordedUrl]);

  return {
    isRecording,
    isPaused,
    recordedBlob,
    recordedUrl,
    duration,
    isSupported,
    hasCameraPermission,
    isAudioOnly,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearRecording,
    stream
  };
}
