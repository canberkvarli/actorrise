import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center border px-2 py-0.5 text-xs font-medium focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-primary",
        secondary:
          "bg-secondary text-secondary-foreground border-border",
        destructive:
          "bg-destructive text-destructive-foreground border-destructive",
        outline: "text-foreground border-border bg-background",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }



