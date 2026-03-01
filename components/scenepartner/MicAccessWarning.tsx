'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Mic, RefreshCw } from 'lucide-react';
import { useMicPermission } from '@/hooks/useMicPermission';

/**
 * Compact inline warning when the microphone is not accessible.
 * Minimal footprint — single line with icon, message, and action.
 */
export function MicAccessWarning() {
  const { status, isBlocked, requestMic } = useMicPermission({ recheckOnVisible: true });

  const isUnavailable = status === 'unavailable';
  const message = isUnavailable
    ? 'Microphone not available on this device'
    : 'Microphone access needed for rehearsal';

  return (
    <AnimatePresence>
      {status !== null && isBlocked && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="mb-3"
        >
          <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <Mic className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-amber-800 text-xs flex-1">{message}</span>
            {!isUnavailable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                onClick={requestMic}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Allow
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
