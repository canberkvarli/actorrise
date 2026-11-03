"use client";

/**
 * The Studio's controls: shadcn/ui components (cva + Radix Slot + Tailwind),
 * in Linear's proportions: 28px buttons (24px small), 6px corners, 13px
 * medium labels, hairline borders, a key hint where there is a shortcut.
 *
 * They read shadcn's theme variables, which StudioStyles redefines on
 * .studio-root only, so the rest of ActorRise keeps its own theme.
 */

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-[13px] font-medium leading-none tracking-[-0.005em] transition-colors duration-100 outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:bg-white",
        secondary: "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-foreground",
        outline: "border-border bg-transparent text-secondary-foreground hover:bg-accent hover:text-foreground",
        ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
      },
      size: {
        default: "h-7 px-2.5",
        sm: "h-6 rounded-[5px] px-2 text-xs",
        lg: "h-8 px-3",
        icon: "size-7",
      },
      pressed: {
        true: "border-white/20 bg-white/[0.13] text-white hover:bg-white/[0.16] hover:text-white",
        false: "",
      },
    },
    defaultVariants: { variant: "secondary", size: "default", pressed: false },
  },
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed">,
    Omit<VariantProps<typeof buttonVariants>, "pressed"> {
  asChild?: boolean;
  /** A toggle: on is lit, off is quiet. */
  pressed?: boolean;
  /** The shortcut, shown as a small key after the label. */
  kbd?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, pressed, kbd, asChild = false, children, type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        aria-pressed={pressed}
        className={cn(buttonVariants({ variant, size, pressed: !!pressed }), className)}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {children}
            {kbd && <Kbd className={variant === "default" ? "border-black/15 bg-black/5 text-black/55" : undefined}>{kbd}</Kbd>}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] border border-white/[0.12] bg-white/[0.03] px-1 font-sans text-[10.5px] font-medium leading-none text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** A row of mutually exclusive options, as small toggles. */
export function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; name: string; title?: string }[];
  value: T | null;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <Button key={o.id} size="sm" pressed={value === o.id} title={o.title} onClick={() => onChange(o.id)}>
          {o.name}
        </Button>
      ))}
    </div>
  );
}

/** The Studio's shadcn theme and shared field styles, scoped to .studio-root. Rendered once. */
export function StudioStyles() {
  return (
    <style>{`
      .studio-root {
        --background: #000000;
        --foreground: #ededed;
        --primary: #ededed;
        --primary-foreground: #000000;
        --secondary: rgba(255,255,255,0.05);
        --secondary-foreground: #d4d4d4;
        --accent: rgba(255,255,255,0.08);
        --accent-foreground: #ffffff;
        --muted: rgba(255,255,255,0.05);
        --muted-foreground: #8f8f8f;
        --border: rgba(255,255,255,0.09);
        --input: rgba(255,255,255,0.09);
        --ring: #ffffff;
        --popover: #0f0f10;
        --popover-foreground: #ededed;
        --radius: 6px;
        --font-sans: var(--font-studio), system-ui, sans-serif;
        color: #ededed;
      }
      .studio-root ::selection { background: rgba(255,255,255,0.22); }
      .studio-root .font-typewriter { font-family: var(--font-geist-mono), ui-monospace, monospace; }
      .studio-root :focus-visible { outline: 2px solid rgba(255,255,255,0.5); outline-offset: 2px; }
      .studio-root [cmdk-input]:focus-visible, .studio-root .studio-bare:focus-visible, .studio-root .studio-field:focus-visible { outline: none; }
      .sui-sheet {
        background: rgba(15,15,16,0.96); border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 24px 64px rgba(0,0,0,0.6);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      }
      .studio-field { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: #ededed; padding: 8px 10px; font: 400 14px/1.5 var(--font-studio), system-ui, sans-serif; outline: none; resize: none; transition: border-color 120ms, background 120ms; user-select: text; }
      .studio-field:focus { border-color: rgba(255,255,255,0.28); background: rgba(255,255,255,0.05); }
      .studio-field::placeholder { color: #5c5c5c; }
      .studio-bare { width: 100%; background: transparent; border: 0; outline: none; color: #ededed; padding: 0; user-select: text; }
      .studio-bare::placeholder { color: #5c5c5c; }
      .studio-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.12) transparent; }
    `}</style>
  );
}
