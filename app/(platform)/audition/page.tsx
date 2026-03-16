'use client';

import { motion } from 'framer-motion';
import { Construction } from 'lucide-react';
import { IconCamera, IconSparkles, IconDownload, IconShare } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function AuditionPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center justify-center min-h-[70vh] text-center"
        >
          <div className="flex items-center gap-3 mb-6">
            <IconCamera className="w-10 h-10 text-primary" />
            <IconSparkles className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">Self-Tape Studio</h1>
          <div className="flex items-center gap-2 text-muted-foreground mb-6">
            <Construction className="w-5 h-5" />
            <p className="text-lg">Coming soon</p>
          </div>
          <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">
            Record professional self-tape auditions right from your browser. No extra apps, no complicated setups.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg w-full mb-10 text-left">
            <div className="border border-border/60 p-4 space-y-1.5">
              <IconCamera className="w-5 h-5 text-primary" />
              <p className="text-sm font-medium">Record in-browser</p>
              <p className="text-xs text-muted-foreground">Camera + mic, framing grid, no downloads needed</p>
            </div>
            <div className="border border-border/60 p-4 space-y-1.5">
              <IconSparkles className="w-5 h-5 text-primary" />
              <p className="text-sm font-medium">AI scene partner</p>
              <p className="text-xs text-muted-foreground">Your scene partner reads the other lines live while you record</p>
            </div>
            <div className="border border-border/60 p-4 space-y-1.5">
              <IconDownload className="w-5 h-5 text-primary" />
              <p className="text-sm font-medium">Download &amp; save</p>
              <p className="text-xs text-muted-foreground">Export your takes as MP4, keep them in your tape library</p>
            </div>
            <div className="border border-border/60 p-4 space-y-1.5">
              <IconShare className="w-5 h-5 text-primary" />
              <p className="text-sm font-medium">Share with a link</p>
              <p className="text-xs text-muted-foreground">Send a shareable link to your agent or casting director</p>
            </div>
          </div>

          <Button asChild variant="outline" size="lg">
            <Link href="/my-scripts">Back to My Scripts</Link>
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
