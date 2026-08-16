import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all cursor-pointer focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:border-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90 hover:border-destructive/90",
        outline:
          "border-border bg-background hover:bg-foreground hover:text-background",
        secondary:
          "bg-secondary text-secondary-foreground border-border hover:bg-foreground hover:text-background",
        ghost: "border-transparent hover:bg-accent hover:text-accent-foreground hover:border-accent",
        link: "text-primary border-transparent underline-offset-4 hover:underline",
      },
      // Touch targets. default and icon were 40px and sm was 32px, all under the
      // 44px iOS minimum, across ~390 call sites. min-h/min-w lifts them on touch
      // and md:min-h-0 hands desktop back its exact previous density, so nothing
      // above md changes by a single pixel. lg is already 48px.
      // sm gets it too: the only dense horizontal toolbars using sm are the admin
      // pages, which are desktop-only, and those keep 32px via the md reset.
      size: {
        default: "h-10 px-6 py-2 min-h-[44px] md:min-h-0",
        sm: "h-8 px-4 text-xs min-h-[44px] md:min-h-0",
        lg: "h-12 px-10 text-base",
        icon: "h-10 w-10 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }



