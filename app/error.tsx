"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useT } from "@/lib/i18n";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-destructive">{t("appShellErrors.wrongTitle")}</CardTitle>
          <CardDescription>
            {t("appShellErrors.wrongBody")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Button onClick={reset} className="flex-1 sm:flex-none">
            {t("appShellErrors.tryAgain")}
          </Button>
          <Button asChild variant="outline" className="flex-1 sm:flex-none">
            <Link href="/">{t("appShellErrors.goHome")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
