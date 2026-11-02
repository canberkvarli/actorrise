"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { useT } from "@/lib/i18n";

/* The page body, a client component so the copy can follow the visitor's
   language. The server HTML is still English (see lib/i18n/index.tsx). */
export function ForStudentsContent() {
  const t = useT();

  return (
    <>
      <StageHero
        direction={t("audStudents.direction")}
        title={
          <>
            {t("audStudents.titleA")}
            <em className="italic text-primary">{t("audStudents.titleEm")}</em>
            {t("audStudents.titleB")}
          </>
        }
        lede={t("audStudents.lede")}
      />

      <div className="container mx-auto max-w-2xl px-6 py-12 md:py-16">
        <p className="mb-8 text-lg text-muted-foreground">{t("audStudents.intro")}</p>

        <div className="mb-10 space-y-6">
          <div>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              {t("audStudents.teachHeading")}
            </h2>
            <p className="text-muted-foreground">
              {t("audStudents.teachA")}
              <Link prefetch={false} href="/for-teachers" className="font-medium text-foreground underline hover:no-underline">
                {t("audStudents.teachLink")}
              </Link>
              {t("audStudents.teachB")}
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              {t("audStudents.studentHeading")}
            </h2>
            <p className="text-muted-foreground">{t("audStudents.studentBody")}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/signup">{t("audStudents.startFree")}</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/">{t("audStudents.trySearch")}</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
