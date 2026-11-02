"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL } from "@/lib/api";
import { StageHero } from "@/components/marketing/StageHero";
import { useT } from "@/lib/i18n";

type LeadMagnetItem = {
  id: number;
  title: string;
  character_name: string;
  play_title: string;
  author: string;
  scene_description: string | null;
  estimated_duration_seconds: number;
};

export default function FiveMonologuesPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [list, setList] = useState<LeadMagnetItem[]>([]);
  const t = useT();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/lead-magnet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setErrorMessage(data?.error || t("audFive.errGeneric"));
        return;
      }
      setStatus("success");
      const listRes = await fetch(`${API_URL}/api/monologues/lead-magnet?limit=5`);
      if (listRes.ok) {
        const items = await listRes.json();
        setList(Array.isArray(items) ? items : []);
      }
    } catch {
      setStatus("error");
      setErrorMessage(t("audFive.errNetwork"));
    }
  };

  if (status === "success") {
    return (
      <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
        <h1 className="font-brand font-semibold text-3xl md:text-4xl text-foreground mb-2">
          {t("audFive.successTitle")}
        </h1>
        <p className="text-muted-foreground mb-8">
          {t("audFive.successBody")}
        </p>
        <ul className="space-y-6 mb-10">
          {list.length > 0 ? (
            list.map((m) => (
              <li key={m.id} className="border border-border rounded-lg p-4">
                <div className="font-semibold text-foreground">
                  {m.character_name}, {m.title}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {t("audFive.fromA", { author: m.author })}
                  <em>{m.play_title}</em>
                  {t("audFive.fromB", { author: m.author })}
                  {m.estimated_duration_seconds > 0 && (
                    <span> · {t("audFive.minutes", { n: Math.round(m.estimated_duration_seconds / 60) })}</span>
                  )}
                </div>
                {m.scene_description && (
                  <p className="text-sm text-muted-foreground mt-2">{m.scene_description}</p>
                )}
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link prefetch={false} href={`/monologue/${m.id}`}>{t("audFive.viewOn")}</Link>
                </Button>
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">
              {t("audFive.loadFailA")}
              <Link prefetch={false} href="/monologues" className="text-primary underline">
                {t("audFive.loadFailLink")}
              </Link>
              {t("audFive.loadFailB")}
            </li>
          )}
        </ul>
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/signup">{t("audFive.startRehearsing")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <StageHero
        direction={t("audFive.direction")}
        title={
          <>
            {t("audFive.titleA")}
            <em className="italic text-primary">{t("audFive.titleEm")}</em>
            {t("audFive.titleB")}
          </>
        }
        lede={t("audFive.lede")}
      />
      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="lead-magnet-email">{t("auth.email")}</Label>
          <Input
            id="lead-magnet-email"
            type="email"
            placeholder={t("audFive.placeholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="max-w-md"
            disabled={status === "loading"}
          />
        </div>
        {status === "error" && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}
        <Button type="submit" size="lg" disabled={status === "loading"} className="rounded-full px-6">
          {status === "loading" ? t("audFive.sending") : t("audFive.send")}
        </Button>
      </form>
      <p className="mt-8 text-sm text-muted-foreground">
        {t("audFive.privacy")}
      </p>
      </div>
    </>
  );
}
