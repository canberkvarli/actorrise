"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { useT, useTList } from "@/lib/i18n";

/* The page body, a client component so the copy can follow the visitor's
   language. The server HTML is still English (see lib/i18n/index.tsx). */
export function ForTeachersContent() {
  const t = useT();
  const tList = useTList();

  const plans = [
    { name: t("audTeachers.planClassroomName"), rest: t("audTeachers.planClassroom") },
    { name: t("audTeachers.planProgramName"), rest: t("audTeachers.planProgram") },
    { name: t("audTeachers.planDistrictName"), rest: t("audTeachers.planDistrict") },
  ];

  return (
    <>
      <StageHero
        direction={t("audTeachers.direction")}
        title={
          <>
            {t("audTeachers.titleA")}
            <em className="italic text-primary">{t("audTeachers.titleEm")}</em>
            {t("audTeachers.titleB")}
          </>
        }
        lede={t("audTeachers.lede")}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <p className="text-lg text-muted-foreground mb-8">{t("audTeachers.intro")}</p>
      <ul className="space-y-3 text-muted-foreground mb-10">
        {tList("audTeachers.features").map((feature) => (
          <li key={feature} className="flex gap-2">
            <span className="text-primary">·</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <h2 className="mb-3 text-lg font-semibold text-foreground">{t("audTeachers.howHeading")}</h2>
      <ol className="mb-8 list-decimal space-y-2 pl-5 text-muted-foreground">
        {tList("audTeachers.steps").map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mb-8 text-sm text-muted-foreground">{t("audTeachers.ageNote")}</p>

      <h2 className="mb-3 text-lg font-semibold text-foreground">{t("audTeachers.keepHeading")}</h2>
      <p className="mb-3 text-muted-foreground">{t("audTeachers.keepBody")}</p>
      <ul className="mb-8 space-y-2 text-muted-foreground">
        {plans.map((plan) => (
          <li key={plan.name} className="flex gap-2">
            <span className="text-primary">·</span>
            <span>
              <strong className="text-foreground">{plan.name}</strong>
              {plan.rest}
            </span>
          </li>
        ))}
      </ul>
      <p className="mb-8 text-muted-foreground">
        {t("audTeachers.ownA")}
        <a
          href="mailto:canberk@actorrise.com"
          className="text-foreground font-medium underline hover:no-underline"
        >
          canberk@actorrise.com
        </a>
        {t("audTeachers.ownB")}
      </p>
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/signup">{t("audTeachers.signUp")}</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/">{t("audTeachers.explore")}</Link>
        </Button>
      </div>
      </div>
    </>
  );
}
