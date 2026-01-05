"use client";

/**
 * Subscription Success Page
 *
 * Shown after successful payment. Confirms subscription and provides next steps.
 */

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconCheck, IconArrowRight, IconSparkles } from "@tabler/icons-react";
import api from "@/lib/api";
import Link from "next/link";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

interface SubscriptionData {
  tier_name: string;
  tier_display_name: string;
  status: string;
  billing_period: string;
}

export default function SuccessPage() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch updated subscription (may take a moment for webhook to process)
    const fetchSubscription = async () => {
      try {
        // Wait a bit for webhook to process
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const response = await api.get<SubscriptionData>("/api/subscriptions/me");
        setSubscription(response.data);
      } catch (error) {
        console.error("Failed to fetch subscription:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubscription();
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <Skeleton className="h-12 w-64 mb-8 mx-auto" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <IconCheck className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-4xl font-bold mb-2">Welcome to {subscription?.tier_display_name}!</h1>
        <p className="text-xl text-muted-foreground">
          Your subscription is now active. Let's get started.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Subscription Details</CardTitle>
              <Badge variant="default">{subscription?.tier_display_name}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Plan</p>
                <p className="font-medium">{subscription?.tier_display_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Billing</p>
                <p className="font-medium capitalize">{subscription?.billing_period}</p>
              </div>
            </div>

            <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
              <h3 className="font-medium mb-2 flex items-center gap-2">
                <IconSparkles className="h-4 w-4 text-accent" />
                What's Next?
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <IconCheck className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <span>Start searching for monologues with AI-powered semantic search</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <span>Get personalized recommendations based on your profile</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <span>Bookmark your favorite monologues for quick access</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <span>Download monologues in PDF and TXT formats</span>
                </li>
                {subscription?.tier_name === "elite" && (
                  <>
                    <li className="flex items-start gap-2">
                      <IconCheck className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>Create collections to organize your repertoire</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <IconCheck className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>
                        Get early access to ScenePartner and CraftCoach AI (coming soon!)
                      </span>
                    </li>
                  </>
                )}
              </ul>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Receipt has been sent to your email</p>
              <p>• You can manage your subscription anytime from billing settings</p>
              <p>• Need help? Contact us at support@actorrise.com</p>
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/billing">View Billing</Link>
            </Button>
            <Button asChild className="flex-1">
              <Link href="/search">
                Start Searching
                <IconArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </motion.div>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Questions?{" "}
        <Link href="/contact" className="underline">
          Contact Support
        </Link>
      </p>
    </div>
  );
}
