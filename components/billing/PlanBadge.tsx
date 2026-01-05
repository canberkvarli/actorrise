"use client";

/**
 * Plan Badge Component
 *
 * Displays the user's current subscription tier with an icon.
 * Used in navigation, profile dropdown, billing dashboard, etc.
 */

import { Badge } from "@/components/ui/badge";
import { IconSparkles, IconRocket, IconCrown } from "@tabler/icons-react";

interface PlanBadgeProps {
  planName: string;
  variant?: "default" | "outline" | "secondary";
  showIcon?: boolean;
}

export function PlanBadge({ planName, variant = "default", showIcon = true }: PlanBadgeProps) {
  const getIcon = () => {
    switch (planName.toLowerCase()) {
      case "pro":
        return <IconRocket className="h-3 w-3" />;
      case "elite":
        return <IconCrown className="h-3 w-3" />;
      case "free":
      default:
        return <IconSparkles className="h-3 w-3" />;
    }
  };

  const getDisplayName = () => {
    switch (planName.toLowerCase()) {
      case "pro":
        return "Pro";
      case "elite":
        return "Elite";
      case "free":
      default:
        return "Free";
    }
  };

  return (
    <Badge variant={variant} className={showIcon ? "gap-1" : ""}>
      {showIcon && getIcon()}
      {getDisplayName()}
    </Badge>
  );
}
