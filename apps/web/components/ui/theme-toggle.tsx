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

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <IconSun className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={handleToggle}
    >
      {resolvedTheme === "dark" ? (
        <IconSun className="h-4 w-4" />
      ) : (
        <IconMoon className="h-4 w-4" />
      )}
    </Button>
  )
}
