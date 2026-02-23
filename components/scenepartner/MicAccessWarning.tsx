'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Mic, RefreshCw } from 'lucide-react';
import { useMicPermission } from '@/hooks/useMicPermission';

/**
 * Renders a warning when the microphone is not accessible on any ScenePartner screen
 * (scripts, script detail, or during rehearsal). Shown when status is denied or unavailable.
 * Slides in from the top when mic is turned off.
 */
export function MicAccessWarning() {
  const { status, isBlocked, requestMic } = useMicPermission({ recheckOnVisible: true });

  const isUnavailable = status === 'unavailable';
  const title = isUnavailable
    ? 'Microphone not available'
    : 'Microphone access is off';
  const description = isUnavailable
    ? 'This browser or device doesn’t support microphone access. Scene Partner needs the mic to hear your lines.'
    : 'Allow microphone access in your browser so Scene Partner can hear you during rehearsal.';

  return (
    <AnimatePresence>
      {status !== null && isBlocked && (
        <motion.div
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -16, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="mb-4"
        >
          <Alert variant="destructive" className="w-full max-w-md">
            <Mic className="h-4 w-4 shrink-0" />
            <div className="min-w-0 pl-7">
              <AlertTitle className="text-lg font-semibold">{title}</AlertTitle>
              <AlertDescription className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <span className="text-sm leading-relaxed">{description}</span>
                {!isUnavailable && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-destructive text-destructive hover:bg-destructive hover:text-white focus-visible:ring-destructive"
                    onClick={requestMic}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Try again
                  </Button>
                )}
              </AlertDescription>
            </div>
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
