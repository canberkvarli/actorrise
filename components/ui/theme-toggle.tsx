"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { IconSun, IconMoon } from "@tabler/icons-react"

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const handleToggle = React.useCallback(() => {
    const next = resolvedTheme === "dark" ? "light" : "dark"

    // If View Transitions API is available, use it for a smooth diagonal wipe
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        setTheme(next)
      })
    } else {
      // Fallback: instant swap
      setTheme(next)
    }
  }, [resolvedTheme, setTheme])

  // 44px hit area on touch, back to the compact 36px icon button from md up.
  // It sits beside a 44px hamburger in the mobile header, so at h-9 it was both
  // under the iOS minimum and visibly the odd one out.
  const sizing = "h-9 w-9 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"

  if (!mounted) {
    // Pre-hydration placeholder: theme is unknown, so the label stays generic.
    return (
      <Button variant="ghost" size="icon" className={sizing} aria-label="Toggle theme">
        <IconSun className="h-4 w-4" />
      </Button>
    )
  }

  const isDark = resolvedTheme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      className={sizing}
      onClick={handleToggle}
      // The button had no accessible name at all, icon-only with no label, so it
      // announced as just "button".
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? (
        <IconSun className="h-4 w-4" />
      ) : (
        <IconMoon className="h-4 w-4" />
      )}
    </Button>
  )
}
