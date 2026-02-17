"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IconSearch, IconLoader2 } from "@tabler/icons-react";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/api";
import type { DemoSearchResultItem } from "./LandingDemoResultCard";
import { LandingDemoResultCard } from "./LandingDemoResultCard";

const LOADING_MESSAGES = [
  "Clanking through the archives...",
  "Asking Shakespeare for advice...",
  "Consulting the drama gods...",
  "Digging through the classics...",
  "Finding your perfect piece...",
  "Searching backstage...",
];

export function LandingDemoSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DemoSearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [rateLimitedWhileLoggedIn, setRateLimitedWhileLoggedIn] = useState(false);
  const [jitter, setJitter] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setJitter(true);
      return;
    }
    setError(null);
    setRateLimited(false);
    setRateLimitedWhileLoggedIn(false);
    setIsLoading(true);
    setResults([]);

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
            placeholder="e.g. funny piece for young woman, 2 minutes..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 h-12 text-base"
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

      {isLoading && (
        <div className="w-screen relative left-1/2 -ml-[50vw] mt-12">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-4">
            <p className="text-muted-foreground text-sm animate-pulse" key={loadingMessageIndex}>
              {LOADING_MESSAGES[loadingMessageIndex]}
            </p>
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
        <Card className="border-primary/30 bg-primary/5 max-w-xl mx-auto mt-12">
          <CardContent className="pt-6 pb-6">
            <p className="text-foreground font-medium mb-4">
              You&apos;ve tried the demo. Sign up to search anytime.
            </p>
            <Button asChild size="lg" className="rounded-full">
              <Link href="/signup">Sign up free</Link>
            </Button>
          </CardContent>
        </Card>
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

    </div>
  );
}
