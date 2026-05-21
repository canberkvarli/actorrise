'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Mic, RefreshCw, X } from 'lucide-react';
import { useMicPermission } from '@/hooks/useMicPermission';
import { useState } from 'react';

/**
 * Compact inline warning when the microphone is not accessible.
 * Non-intrusive banner that can be dismissed.
 */
export function MicAccessWarning() {
  const { status, isBlocked, requestMic } = useMicPermission({ recheckOnVisible: true });
  const [dismissed, setDismissed] = useState(false);

  const isUnavailable = status === 'unavailable';

  if (dismissed) return null;

  return (
    <AnimatePresence>
      {status !== null && isBlocked && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="mb-3 flex justify-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-800/80 px-3 py-1.5 text-xs">
            <Mic className="w-3 h-3 text-orange-400 shrink-0" />
            <span className="text-neutral-300">
              {isUnavailable ? 'Mic not available' : 'Mic access needed'}
            </span>
            {!isUnavailable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[11px] text-orange-400 hover:text-orange-300 hover:bg-neutral-700 rounded-full"
                onClick={requestMic}
              >
                <RefreshCw className="w-2.5 h-2.5 mr-1" />
                Allow
              </Button>
            )}
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-neutral-500 hover:text-neutral-300 transition-colors ml-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
