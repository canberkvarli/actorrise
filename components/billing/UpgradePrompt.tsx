"use client";

/**
 * Upgrade Prompt Component
 *
 * Modal or card prompting users to upgrade when they hit feature limits.
 * Used when search limit is exceeded or premium features are accessed.
 */

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconSparkles, IconRocket, IconCrown, IconX } from "@tabler/icons-react";
import Link from "next/link";

interface UpgradePromptProps {
  feature: string;
  message: string;
  currentPlan: string;
  recommendedPlan: "pro" | "elite" | "plus" | "unlimited";
  onClose?: () => void;
  variant?: "card" | "modal";
}

export function UpgradePrompt({
  feature,
  message,
  currentPlan,
  recommendedPlan,
  onClose,
  variant = "card",
}: UpgradePromptProps) {
  const getPlanDetails = () => {
    switch (recommendedPlan) {
      case "elite":
      case "unlimited":
        return {
          name: "Unlimited",
          icon: <IconCrown className="h-5 w-5 text-accent" />,
          price: "$39/month",
          annualPrice: "$324/year",
          saveBadge: "Save $144/year",
          benefits: [
            "Unlimited AI searches",
            "Unlimited script uploads",
            "100 ScenePartner AI sessions/month",
            "Advanced analytics & insights",
          ],
        };
      case "pro":
      case "plus":
      default:
        return {
          name: "Plus",
          icon: <IconRocket className="h-5 w-5 text-accent" />,
          price: "$12/month",
          annualPrice: "$99/year",
          saveBadge: "save 31%",
          benefits: [
            "150 AI searches/month",
            "Up to 10 script uploads",
            "30 ScenePartner AI sessions/month",
            "Personalized recommendations",
          ],
        };
    }
  };

  const planDetails = getPlanDetails();

  return (
    <Card className="border-accent">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {planDetails.icon}
            <CardTitle className="text-lg">Unlock {feature}</CardTitle>
          </div>
          {onClose && variant === "modal" && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
              <IconX className="h-4 w-4" />
            </Button>
          )}
        </div>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-2xl font-bold">{planDetails.price}</span>
            <span className="text-sm text-muted-foreground">
              or {planDetails.annualPrice} ({planDetails.saveBadge})
            </span>
          </div>
          <Badge variant="secondary" className="text-xs">
            Upgrade from {currentPlan}
          </Badge>
        </div>

        <div>
          <p className="text-sm font-medium mb-2">What you'll get:</p>
          <ul className="space-y-1">
            {planDetails.benefits.map((benefit, idx) => (
              <li key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                <IconSparkles className="h-3 w-3 text-accent" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        {onClose && (
          <Button variant="outline" onClick={onClose} className="flex-1">
            Maybe Later
          </Button>
        )}
        <Button asChild className="flex-1">
          <Link href={`/pricing?recommended=${recommendedPlan}`}>
            Upgrade to {planDetails.name}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
