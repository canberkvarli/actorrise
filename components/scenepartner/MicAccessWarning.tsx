'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Mic, RefreshCw } from 'lucide-react';
import { useMicPermission } from '@/hooks/useMicPermission';

/**
 * Renders a warning when the microphone is not accessible on any ScenePartner screen
 * (scripts, script detail, or during rehearsal). Shown when status is denied or unavailable.
 */
export function MicAccessWarning() {
  const { status, isBlocked, requestMic } = useMicPermission({ recheckOnVisible: true });

  if (status === null || !isBlocked) return null;

  const isUnavailable = status === 'unavailable';
  const title = isUnavailable
    ? 'Microphone not available'
    : 'Microphone access is off';
  const description = isUnavailable
    ? 'This browser or device doesn’t support microphone access. Scene Partner needs the mic to hear your lines.'
    : 'Allow microphone access in your browser so Scene Partner can hear you during rehearsal.';

  return (
    <Alert variant="destructive" className="mb-4">
      <Mic className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{description}</span>
        {!isUnavailable && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 sm:mt-0 shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={requestMic}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
