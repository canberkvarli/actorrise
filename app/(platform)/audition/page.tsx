'use client';

import { motion } from 'framer-motion';
import { Video, Sparkles, Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function AuditionModePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center justify-center min-h-[70vh] text-center"
        >
          <div className="flex items-center gap-3 mb-6">
            <Video className="w-10 h-10 text-primary" />
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">Audition Mode</h1>
          <div className="flex items-center gap-2 text-muted-foreground mb-6">
            <Construction className="w-5 h-5" />
            <p className="text-lg">Under construction</p>
          </div>
          <p className="text-muted-foreground max-w-md mb-8">
            We&apos;re still building this feature. Record yourself, get AI casting director feedback, and more—coming soon.
          </p>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard">Back to Home</Link>
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
