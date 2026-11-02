'use client';

import { useCallback } from 'react';
import { useT, type MessageKey } from '@/lib/i18n';
import { plainError, type ErrorKind } from '@/lib/rehearsal/prepare';

const KINDS: ErrorKind[] = ['stt', 'mic', 'line', 'gate', 'other'];

/**
 * The rehearsal's errors arrive as lib/rehearsal/prepare's English sentences.
 * Shown, a known sentence reads in the actor's language; a gate message
 * written by the server is shown as the server wrote it.
 */
export function useErrorText() {
  const t = useT();
  return useCallback((message: string | null) => {
    if (message === null) return null;
    const kind = KINDS.find(k => plainError(k) === message);
    return kind ? t(`appScenesErrors.${kind}` as MessageKey) : message;
  }, [t]);
}
