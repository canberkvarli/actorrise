"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconCheck } from "@tabler/icons-react";

interface LandingWaitlistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
}

/**
 * Waitlist modal for Scene Partner AI beta signups.
 * Collects email addresses to notify when feature launches.
 */
export function LandingWaitlistModal({ open, onOpenChange, feature }: LandingWaitlistModalProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // TODO: Integrate with backend API or email service
    // For now, just simulate success
    await new Promise(resolve => setTimeout(resolve, 1000));

    setIsSuccess(true);
    setIsSubmitting(false);

    // Reset form after 2 seconds and close modal
    setTimeout(() => {
      setEmail("");
      setIsSuccess(false);
      onOpenChange(false);
    }, 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {isSuccess ? (
          // Success State
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="size-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
              <IconCheck size={32} className="text-green-600 dark:text-green-400" />
            </div>
            <DialogTitle className="text-2xl mb-2">You're on the list!</DialogTitle>
            <DialogDescription>
              We'll email you when {feature} launches. No spam, promise.
            </DialogDescription>
          </div>
        ) : (
          // Form State
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">Join the {feature} Beta</DialogTitle>
              <DialogDescription>
                Be first to rehearse with AI. We'll email you when it launches.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <Input
                  type="email"
                  placeholder="actor@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className="h-12"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isSubmitting || !email}
              >
                {isSubmitting ? "Joining..." : "Join Waitlist"}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                No spam. Unsubscribe anytime. We respect your privacy.
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
