'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSubscription } from '@/hooks/useSubscription';
import { useTapes, useDeleteTape, useShareTape } from '@/hooks/useTapes';
import type { Tape } from '@/hooks/useTapes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  IconVideo,
  IconPlayerPlay,
  IconTrash,
  IconShare,
  IconArrowRight,
  IconDeviceFloppy,
  IconCalendar,
  IconDots,
  IconLink,
  IconCheck,
  IconDownload,
  IconLoader2,
} from '@tabler/icons-react';

const SAVE_LIMITS: Record<string, number> = {
  free: 0,
  solo: 0,
  plus: 15,
  pro: 50,
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function MyTapesPage() {
  const { subscription } = useSubscription();
  const userTier = subscription?.tier_name || 'free';
  const saveLimit = SAVE_LIMITS[userTier] || 0;
  const canSave = saveLimit > 0;
  const canShare = userTier === 'pro';

  const { data: tapesData, isLoading } = useTapes();
  const deleteTape = useDeleteTape();
  const shareTape = useShareTape();

  const tapes = tapesData?.tapes || [];
  const tapeCount = tapesData?.count || 0;
  const tapeLimit = tapesData?.limit || saveLimit;

  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleCopyLink = async (tape: Tape) => {
    if (tape.is_shared) {
      const url = `${window.location.origin}/tape/${tape.share_uuid}`;
      await navigator.clipboard.writeText(url);
      setCopiedId(tape.id);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      // Share first, then copy
      try {
        const result = await shareTape.mutateAsync(tape.id);
        const url = `${window.location.origin}${result.share_url}`;
        await navigator.clipboard.writeText(url);
        setCopiedId(tape.id);
        setTimeout(() => setCopiedId(null), 2000);
      } catch {
        // Handle error
      }
    }
    setActiveMenu(null);
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteTape.mutateAsync(id);
    } catch {
      // Handle error
    } finally {
      setDeletingId(null);
      setActiveMenu(null);
    }
  };

  // Gate: users without save access see upgrade prompt
  if (!canSave) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 lg:px-8 py-8 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center min-h-[60vh] text-center"
          >
            <div className="w-16 h-16 rounded-full border-2 border-primary/20 flex items-center justify-center mb-6 bg-primary/5">
              <IconDeviceFloppy className="w-7 h-7 text-primary/60" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Tape Library</h1>
            <p className="text-muted-foreground max-w-sm mb-8">
              Save your self-tapes to the cloud and access them anytime. Available on Plus and Pro plans.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild className="gap-2">
                <Link href="/pricing">
                  Upgrade to Plus
                  <IconArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <Link href="/audition">
                  <IconVideo className="w-4 h-4" />
                  Record a tape
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 lg:px-8 py-6 max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">My Tapes</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tapeCount}/{tapeLimit} tapes saved
            </p>
          </div>
          <Button asChild className="gap-2">
            <Link href="/audition">
              <IconVideo className="w-4 h-4" />
              Record New
            </Link>
          </Button>
        </motion.div>

        {/* Storage Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min((tapeCount / tapeLimit) * 100, 100)}%` }}
            />
          </div>
        </motion.div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24">
            <IconLoader2 className="w-6 h-6 text-muted-foreground animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Loading your tapes...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && tapes.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-14 h-14 rounded-full border border-border/50 flex items-center justify-center mb-5 bg-muted/30">
              <IconVideo className="w-6 h-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-medium mb-2">No tapes yet</h2>
            <p className="text-sm text-muted-foreground max-w-xs mb-6">
              Record a self-tape in Audition Mode and save it here for easy access.
            </p>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/audition">
                <IconVideo className="w-4 h-4" />
                Go to Audition Mode
              </Link>
            </Button>
          </motion.div>
        )}

        {/* Tape Grid */}
        {!isLoading && tapes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tapes.map((tape, index) => (
              <motion.div
                key={tape.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * index, duration: 0.3 }}
                className="group relative border border-border/50 rounded-lg overflow-hidden bg-card/50 hover:shadow-md transition-shadow"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-black/90">
                  <div className="w-full h-full flex items-center justify-center">
                    <IconVideo className="w-8 h-8 text-white/20" />
                  </div>
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                      <IconPlayerPlay className="w-5 h-5 text-black ml-0.5" />
                    </div>
                  </div>
                  {/* Duration */}
                  {tape.duration_seconds && (
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-xs font-mono">
                      {formatDuration(tape.duration_seconds)}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tape.title || 'Untitled tape'}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <IconCalendar className="w-3 h-3" />
                        {formatDate(tape.created_at)}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="relative">
                      <button
                        onClick={() => setActiveMenu(activeMenu === tape.id ? null : tape.id)}
                        className="p-1 rounded hover:bg-muted transition-colors"
                      >
                        <IconDots className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <AnimatePresence>
                        {activeMenu === tape.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute right-0 top-full mt-1 z-10 w-44 rounded-lg border border-border/50 bg-card shadow-lg py-1"
                          >
                            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left">
                              <IconDownload className="w-4 h-4" />
                              Download
                            </button>
                            {canShare && (
                              <button
                                onClick={() => handleCopyLink(tape)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                              >
                                {copiedId === tape.id ? (
                                  <>
                                    <IconCheck className="w-4 h-4 text-green-500" />
                                    Copied!
                                  </>
                                ) : (
                                  <>
                                    <IconLink className="w-4 h-4" />
                                    Copy share link
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(tape.id)}
                              disabled={deletingId === tape.id}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left text-destructive disabled:opacity-50"
                            >
                              {deletingId === tape.id ? (
                                <IconLoader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <IconTrash className="w-4 h-4" />
                              )}
                              Delete
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Share badge */}
                  {tape.is_shared && (
                    <Badge variant="secondary" className="text-[10px] mt-2 gap-1">
                      <IconShare className="w-3 h-3" />
                      Shared
                    </Badge>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Pro upsell for sharing */}
        {canSave && !canShare && tapes.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 border border-primary/20 rounded-lg p-5 bg-primary/[0.03]"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1">
                <p className="font-medium text-sm">Share your tapes with casting directors</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Upgrade to Pro to get shareable links for your self-tapes.
                </p>
              </div>
              <Button asChild size="sm" className="gap-2 shrink-0">
                <Link href="/pricing">
                  Upgrade to Pro
                  <IconArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
