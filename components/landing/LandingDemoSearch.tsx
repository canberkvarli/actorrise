"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IconSearch, IconLoader2, IconSparkles } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/api";
import type { DemoSearchResultItem } from "./LandingDemoResultCard";
import { LandingDemoResultCard } from "./LandingDemoResultCard";

const AUTO_DEMO_QUERY = "funny piece for drama school, male";

const AUTO_DEMO_RESULTS: DemoSearchResultItem[] = [
  {
    id: -1,
    character_name: "Malvolio",
    play_title: "Twelfth Night",
    author: "William Shakespeare",
    scene_description: "Malvolio discovers what he believes is a love letter from Olivia, convinced of his own greatness.",
    estimated_duration_seconds: 110,
    relevance_score: 0.91,
    match_type: null,
    text_excerpt: "I have limed her; but it is Jove's doing, and Jove make me thankful!",
  },
  {
    id: -2,
    character_name: "Bottom",
    play_title: "A Midsummer Night's Dream",
    author: "William Shakespeare",
    scene_description: "Bottom wakes from his enchanted sleep and attempts to recall his remarkable dream.",
    estimated_duration_seconds: 90,
    relevance_score: 0.87,
    match_type: null,
    text_excerpt: "I have had a most rare vision. I have had a dream, past the wit of man to say what dream it was.",
  },
  {
    id: -3,
    character_name: "Frank",
    play_title: "Educating Rita",
    author: "Willy Russell",
    scene_description: "Frank, a disillusioned university tutor, reflects on the absurdity of his situation.",
    estimated_duration_seconds: 120,
    relevance_score: 0.82,
    match_type: null,
    text_excerpt: "I'm an appalling teacher. Most of the time, you see, I don't want to talk about literature at all.",
  },
];

const LOADING_MESSAGES = [
  "Clanking through the archives...",
  "Working our magic...",
  "Squeezing the monologue database...",
  "Asking Shakespeare for advice...",
  "Consulting the drama gods...",
  "Searching backstage...",
  "Finding your perfect piece...",
  "Digging through the classics...",
];

export function LandingDemoSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DemoSearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showLoadingUI, setShowLoadingUI] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [rateLimitedWhileLoggedIn, setRateLimitedWhileLoggedIn] = useState(false);
  const [jitter, setJitter] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  type AutoDemoPhase = "idle" | "typing" | "loading" | "results";
  const [autoDemoPhase, setAutoDemoPhase] = useState<AutoDemoPhase>("idle");
  const userHasInteracted = useRef(false);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isLoading]);

  // Avoid quick flicker: only show the loading UI if the request
  // has been in the loading state for at least 150ms.
  useEffect(() => {
    if (!isLoading) {
      setShowLoadingUI(false);
      return;
    }
    const timeout = setTimeout(() => {
      setShowLoadingUI(true);
    }, 150);
    return () => clearTimeout(timeout);
  }, [isLoading]);

  // Auto-demo: typewriter + fake loading + pre-baked results on page load
  useEffect(() => {
    const cancelled = { current: false };

    const startDelay = setTimeout(async () => {
      if (cancelled.current || userHasInteracted.current) return;

      setAutoDemoPhase("typing");
      for (let i = 1; i <= AUTO_DEMO_QUERY.length; i++) {
        if (cancelled.current || userHasInteracted.current) return;
        setQuery(AUTO_DEMO_QUERY.slice(0, i));
        await new Promise((r) => setTimeout(r, 40));
      }

      if (cancelled.current || userHasInteracted.current) return;
      setAutoDemoPhase("loading");
      await new Promise((r) => setTimeout(r, 1400));

      if (cancelled.current || userHasInteracted.current) return;
      setAutoDemoPhase("results");
    }, 600);

    return () => {
      cancelled.current = true;
      clearTimeout(startDelay);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    userHasInteracted.current = true;
    if (autoDemoPhase !== "idle") setAutoDemoPhase("idle");
    const q = query.trim();
    if (!q) {
      setJitter(true);
      return;
    }
    // Demo limit already reached: only jitter the input, don't trigger loading or change bottom sections
    if (rateLimited) {
      setError(null);
      setJitter(true);
      return;
    }
    setError(null);
    setRateLimitedWhileLoggedIn(false);
    setIsLoading(true);
    // Don't clear results here — only set on success. Avoids bottom section collapsing when we get 429.

    try {
      const url = `${API_URL}/api/monologues/search-demo?q=${encodeURIComponent(q)}`;
      const headers: HeadersInit = {};
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const res = await fetch(url, { method: "GET", headers });

      if (res.status === 429) {
        setRateLimited(true);
        setRateLimitedWhileLoggedIn(!!session?.access_token);
        setError(null);
        return;
      }

      if (!res.ok) {
        setError("Something went wrong. Sign up to try full search.");
        return;
      }

      const data = (await res.json()) as { results: DemoSearchResultItem[] };
      setResults(data.results ?? []);
    } catch {
      setError("Something went wrong. Sign up to try full search.");
    } finally {
      setIsLoading(false);
    }
  };

  const hasSearched = results.length > 0 || error !== null || rateLimited;
  const showResults = results.length > 0 && !isLoading;

  return (
    <div className="space-y-6 w-full">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
        <div
          className={`flex items-center gap-2 p-2 bg-card border border-border rounded-xl shadow-sm ${jitter ? "search-jitter" : ""}`}
          onAnimationEnd={() => setJitter(false)}
        >
          <IconSearch className="h-5 w-5 text-muted-foreground shrink-0 ml-2" />
          <Input
            type="text"
            placeholder="e.g. funny piece, 2 min..."
            value={query}
            onChange={(e) => {
              userHasInteracted.current = true;
              if (autoDemoPhase !== "idle") setAutoDemoPhase("idle");
              setQuery(e.target.value);
            }}
            className="flex-1 min-w-0 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 h-12 text-base"
            disabled={isLoading}
            aria-label="Search monologues"
          />
          <Button type="submit" size="lg" disabled={isLoading} className="h-10 px-6 rounded-lg shrink-0">
            {isLoading ? (
              <IconLoader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Search"
            )}
          </Button>
        </div>
      </form>

      {((isLoading && showLoadingUI) || autoDemoPhase === "loading") && (
        <div className="w-screen relative left-1/2 -ml-[50vw] mt-12">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-6">
            <div className="flex flex-col items-center justify-center gap-6 mb-6">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <IconSparkles className="h-7 w-7 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <motion.p
                key={loadingMessageIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-lg font-medium text-foreground"
              >
                {LOADING_MESSAGES[loadingMessageIndex]}
              </motion.p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="rounded-lg">
                  <CardContent className="pt-6 space-y-4">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-12 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {rateLimited && !rateLimitedWhileLoggedIn && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Like what you see?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Get started free
          </Link>
        </p>
      )}
      {rateLimited && rateLimitedWhileLoggedIn && (
        <Card className="border-border bg-muted/30 max-w-xl mx-auto mt-12">
          <CardContent className="pt-6 pb-6">
            <p className="text-foreground font-medium mb-4">
              Demo limit reached. You&apos;re signed in — use the full search to keep going.
            </p>
            <Button asChild size="lg" className="rounded-full" variant="outline">
              <Link href="/search">Go to search</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {error && !rateLimited && (
        <Card className="border-destructive/30 bg-destructive/5 max-w-xl mx-auto mt-12">
          <CardContent className="pt-6 pb-6">
            <p className="text-foreground font-medium mb-4">{error}</p>
            <Button asChild size="lg" className="rounded-full">
              <Link href="/signup">Sign up to try full search</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {showResults && (
        <div className="w-screen relative left-1/2 -ml-[50vw] mt-12">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              We found {results.length} monologue{results.length !== 1 ? "s" : ""}. See the full text and search the full library.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map((result) => (
                <LandingDemoResultCard
                  key={result.id}
                  result={result}
                  signupRedirectQuery={query.trim()}
                />
              ))}
            </div>
            <div className="pt-4">
            <Button asChild size="lg" className="rounded-full px-8 bg-background text-foreground border border-border hover:bg-muted hover:text-foreground hover:border-muted-foreground/30">
              <Link href={`/signup?redirect=${encodeURIComponent(`/search?q=${encodeURIComponent(query.trim())}`)}`}>
                Search 8,600+ monologues
              </Link>
            </Button>
            </div>
          </div>
        </div>
      )}

      {autoDemoPhase === "results" && results.length === 0 && (
        <div className="w-screen relative left-1/2 -ml-[50vw] mt-12">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Example results — search for yours above.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {AUTO_DEMO_RESULTS.map((result) => (
                <LandingDemoResultCard
                  key={result.id}
                  result={result}
                  signupRedirectQuery={AUTO_DEMO_QUERY}
                />
              ))}
            </div>
            <div className="pt-4">
              <Button asChild size="lg" className="rounded-full px-8 bg-background text-foreground border border-border hover:bg-muted hover:text-foreground hover:border-muted-foreground/30">
                <Link href="/signup">Search 8,600+ monologues</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
