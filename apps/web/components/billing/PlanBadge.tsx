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
  className?: string;
}

export function PlanBadge({
  planName,
  variant = "outline",
  showIcon = true,
  className,
}: PlanBadgeProps) {
  const getIcon = () => {
    switch (planName.toLowerCase()) {
      case "pro":
      case "plus":
        return <IconRocket className="h-3 w-3" />;
      case "elite":
      case "unlimited":
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
      case "plus":
        return "Plus";
      case "elite":
        return "Elite";
      case "unlimited":
        return "Unlimited";
      case "free":
      default:
        return "Free";
    }
  };

  const getColorClass = () => {
    switch (planName.toLowerCase()) {
      case "pro":
      case "plus":
        return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-600/50";
      case "elite":
      case "unlimited":
        return "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-600/50";
      default:
        return "";
    }
  };

  const colorClass = getColorClass();

  const combinedClassName = [
    showIcon ? "gap-1" : "",
    colorClass,
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Badge variant={colorClass ? "outline" : variant} className={combinedClassName}>
      {showIcon && getIcon()}
      {getDisplayName()}
    </Badge>
  );
}
