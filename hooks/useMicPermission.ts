'use client';

import { useState, useCallback, useEffect } from 'react';

export type MicPermissionStatus = 'prompt' | 'granted' | 'denied' | 'unavailable';

interface UseMicPermissionOptions {
  /** Re-check when page becomes visible (e.g. user changed permission in another tab). Default true. */
  recheckOnVisible?: boolean;
}

interface UseMicPermissionReturn {
  status: MicPermissionStatus | null;
  isGranted: boolean;
  isBlocked: boolean;
  /** Triggers the browser permission dialog by calling getUserMedia. */
  requestMic: () => Promise<void>;
}

/**
 * Checks microphone access for ScenePartner (rehearsal, scripts, etc.).
 *
 * Uses the Permissions API on mount to read the current state without
 * triggering a browser prompt. Only `requestMic()` actually calls
 * getUserMedia to trigger the permission dialog.
 */
export function useMicPermission(
  options: UseMicPermissionOptions = {}
): UseMicPermissionReturn {
  const { recheckOnVisible = true } = options;
  const [status, setStatus] = useState<MicPermissionStatus | null>(null);

  /** Read permission state via Permissions API — no prompt triggered. */
  const readState = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      return;
    }
    // Permissions API (available in all modern browsers)
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (result.state === 'granted') setStatus('granted');
      else if (result.state === 'denied') setStatus('denied');
      else setStatus('prompt');
    } catch {
      // Fallback for browsers that don't support permissions.query for microphone
      // (e.g. some older Safari). In this case, default to 'prompt' so the user
      // can try clicking Allow.
      setStatus('prompt');
    }
  }, []);

  /** Trigger the actual browser permission dialog via getUserMedia. */
  const requestMic = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setStatus('granted');
    } catch {
      setStatus('denied');
    }
  }, []);

  // Check on mount (no prompt)
  useEffect(() => {
    readState();
  }, [readState]);

  // When mic is granted, poll so we detect revoke
  useEffect(() => {
    if (status !== 'granted') return;
    const interval = setInterval(readState, 2000);
    return () => clearInterval(interval);
  }, [status, readState]);

  // Re-check when page becomes visible
  useEffect(() => {
    if (!recheckOnVisible || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        readState();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [recheckOnVisible, readState]);

  return {
    status,
    isGranted: status === 'granted',
    isBlocked: status === 'denied' || status === 'unavailable',
    requestMic,
  };
}
