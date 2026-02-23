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
  requestMic: () => Promise<void>;
}

/**
 * Checks microphone access for ScenePartner (rehearsal, scripts, etc.).
 * Use with MicAccessWarning to show a banner when mic is denied or unavailable.
 */
export function useMicPermission(
  options: UseMicPermissionOptions = {}
): UseMicPermissionReturn {
  const { recheckOnVisible = true } = options;
  const [status, setStatus] = useState<MicPermissionStatus | null>(null);

  const check = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      return;
    }
    setStatus('prompt');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setStatus('granted');
    } catch {
      setStatus('denied');
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    if (!recheckOnVisible || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && status !== 'granted') {
        check();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [recheckOnVisible, status, check]);

  return {
    status,
    isGranted: status === 'granted',
    isBlocked: status === 'denied' || status === 'unavailable',
    requestMic: check,
  };
}
