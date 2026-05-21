'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { IconVideo, IconAlertCircle } from '@tabler/icons-react';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand/BrandLogo';

interface PublicTape {
  id: number;
  title: string | null;
  duration_seconds: number | null;
  file_path: string;
  created_at: string | null;
  actor_name: string | null;
}

export default function PublicTapePage() {
  const { id } = useParams<{ id: string }>();
  const [tape, setTape] = useState<PublicTape | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchTape = async () => {
      setLoading(true);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiUrl}/api/public/tape/${id}`);
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = await res.json();
        setTape(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchTape();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <IconVideo className="w-10 h-10 text-white/30" />
        </motion.div>
      </div>
    );
  }

  if (error || !tape) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <IconAlertCircle className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">Tape not found</h1>
          <p className="text-white/40 text-sm mb-8">
            This tape may have been removed or the link is invalid.
          </p>
          <Link href="/" className="text-sm text-primary hover:text-primary/80 transition-colors">
            Go to ActorRise
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <Link href="/" className="opacity-60 hover:opacity-100 transition-opacity">
          <BrandLogo size="header" />
        </Link>
        <p className="text-xs text-white/30">Self-tape</p>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-4xl"
        >
          {tape.title && (
            <h1 className="text-lg font-medium text-white mb-4">{tape.title}</h1>
          )}

          <div className="relative aspect-video bg-black/50 rounded-lg overflow-hidden border border-white/5">
            <video
              src={tape.file_path}
              controls
              playsInline
              className="w-full h-full object-contain"
            />
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3 text-xs text-white/30">
              {tape.actor_name && <span>{tape.actor_name}</span>}
              {tape.created_at && (
                <span>
                  {new Date(tape.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>
            <p className="text-[10px] text-white/20">
              Recorded on{' '}
              <Link href="/" className="text-primary/60 hover:text-primary/80 transition-colors">
                ActorRise
              </Link>
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
