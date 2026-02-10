"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { IconLoader2 } from "@tabler/icons-react";

export function DemoLoginButton() {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleDemoLogin = async () => {
    setIsLoading(true);
    try {
      // Demo credentials
      await login("demo@actorrise.com", "demo123");
    } catch (err) {
      console.error("Demo login failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleDemoLogin}
      variant="outline"
      className="w-full"
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <IconLoader2 className="h-4 w-4 animate-spin" />
          Loading demo...
        </>
      ) : (
        "Demo Login"
      )}
    </Button>
  );
}
