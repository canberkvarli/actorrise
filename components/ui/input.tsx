import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // h-10 was 40px, 4px under the 44px touch minimum, on every form field
          // in the app. Desktop keeps 40px via md:min-h-0.
          "flex h-10 min-h-[44px] w-full rounded-lg border border-border bg-background px-4 py-2 text-sm transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }



