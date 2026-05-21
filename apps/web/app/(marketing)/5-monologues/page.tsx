"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_URL } from "@/lib/api";

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
        setErrorMessage(data?.error || "Something went wrong. Please try again.");
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
      setErrorMessage("Network error. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-2">
          Here are your 5 monologues
        </h1>
        <p className="text-muted-foreground mb-8">
          Fresh pieces casting directors would rather see. Find the full text and more like these on ActorRise.
        </p>
        <ul className="space-y-6 mb-10">
          {list.length > 0 ? (
            list.map((m) => (
              <li key={m.id} className="border border-border rounded-lg p-4">
                <div className="font-semibold text-foreground">
                  {m.character_name}, {m.title}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  From <em>{m.play_title}</em> by {m.author}
                  {m.estimated_duration_seconds > 0 && (
                    <span> · {Math.round(m.estimated_duration_seconds / 60)} min</span>
                  )}
                </div>
                {m.scene_description && (
                  <p className="text-sm text-muted-foreground mt-2">{m.scene_description}</p>
                )}
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href={`/monologue/${m.id}`}>View on ActorRise</Link>
                </Button>
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">
              We couldn&apos;t load the list right now.{" "}
              <Link href="/search" className="text-primary underline">
                Search monologues
              </Link>{" "}
              to find fresh pieces.
            </li>
          )}
        </ul>
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/signup">Get started free on ActorRise</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        5 Monologues Casting Directors Would Rather See
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Tired of overdone pieces? Get a curated list of fresh monologues, the kind that make
        casting directors sit up. Enter your email and we&apos;ll send you the list and links to
        find them on ActorRise.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="lead-magnet-email">Email</Label>
          <Input
            id="lead-magnet-email"
            type="email"
            placeholder="you@example.com"
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
          {status === "loading" ? "Sending…" : "Send me the list"}
        </Button>
      </form>
      <p className="mt-8 text-sm text-muted-foreground">
        No spam. We&apos;ll only use your email to send this list and occasional ActorRise updates.
        Unsubscribe anytime.
      </p>
    </div>
  );
}
