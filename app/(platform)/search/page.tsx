"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { SearchTour } from "@/components/onboarding/SearchTour";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { IconSearch, IconSparkles, IconLoader2, IconX, IconFilter, IconBookmark, IconExternalLink, IconEye, IconEyeOff, IconDownload, IconInfoCircle, IconAdjustments, IconTargetArrow, IconSend, IconFlag } from "@tabler/icons-react";

// Fun loading messages for AI search
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
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import { motion, AnimatePresence } from "framer-motion";
import { addSearchToHistory, getSearchById } from "@/lib/searchHistory";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MonologueDetailContent } from "@/components/monologue/MonologueDetailContent";
import { MonologueText } from "@/components/monologue/MonologueText";
import { MonologueResultCard } from "@/components/monologue/MonologueResultCard";
import { SearchFiltersSheet } from "@/components/search/SearchFiltersSheet";
import { ReportMonologueModal } from "@/components/monologue/ReportMonologueModal";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, refreshUser } = useAuth();
  const [showSearchTour, setShowSearchTour] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    gender: "",
    age_range: "",
    emotion: "",
    theme: "",
    category: "",
  });
  /** 0 = freshest only, 0.3 = fresh, 0.5 = some overdone OK, 1 = show all. Separate from filters for clearer UX. */
  const [maxOverdoneScore, setMaxOverdoneScore] = useState(1);
  const [results, setResults] = useState<Monologue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [selectedMonologue, setSelectedMonologue] = useState<Monologue | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const LAST_SEARCH_KEY = "monologue_search_last_results_v1";
  const [restoredFromLastSearch, setRestoredFromLastSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchUpgradeUrl, setSearchUpgradeUrl] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [jitter, setJitter] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Show search tour for first-time visitors
  useEffect(() => {
    if (user && user.has_seen_search_tour === false) {
      const timer = setTimeout(() => setShowSearchTour(true), 800);
      return () => clearTimeout(timer);
    }
  }, [user]);

  // Rotate loading messages every 2 seconds while searching
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const currentLoadingMessage = LOADING_MESSAGES[loadingMessageIndex];

  // Scroll panel to top when monologue is selected
  useEffect(() => {
    if (selectedMonologue && panelRef.current) {
      panelRef.current.scrollTop = 0;
    }
  }, [selectedMonologue]);

  // Restore search state from URL and sessionStorage whenever this page is (re)visited.
  // This allows search results to persist across refreshes AND when navigating away
  // to other pages and then back to /search.
  useEffect(() => {
    // Check if this is a restoration from search history
    const historyId = searchParams.get("id");
    if (historyId) {
      const historyEntry = getSearchById(historyId);
      if (historyEntry) {
        setQuery(historyEntry.query);
        // Normalize filters to ensure all required fields are strings
        setFilters({
          gender: historyEntry.filters.gender || "",
          age_range: historyEntry.filters.age_range || "",
          emotion: historyEntry.filters.emotion || "",
          theme: historyEntry.filters.theme || "",
          category: historyEntry.filters.category || "",
        });
        const h = historyEntry.filters as { exclude_overdone?: string; max_overdone_score?: number };
        setMaxOverdoneScore(typeof h.max_overdone_score === "number" ? h.max_overdone_score : h.exclude_overdone === "true" ? 0.3 : 1);
        setResults(historyEntry.resultPreviews);
        setHasSearched(true);
        return;
      }
    }

    const urlQuery = searchParams.get("q");
    const urlFilters: typeof filters = {
      gender: "",
      age_range: "",
      emotion: "",
      theme: "",
      category: "",
    };
    ["gender", "age_range", "emotion", "theme", "category"].forEach((key) => {
      const value = searchParams.get(key);
      if (value) {
        urlFilters[key as keyof typeof filters] = value;
      }
    });
    const urlMaxOverdone = searchParams.get("max_overdone_score");
    const parsedMax = urlMaxOverdone ? parseFloat(urlMaxOverdone) : NaN;
    const initialMaxOverdone = !Number.isNaN(parsedMax) && parsedMax >= 0 && parsedMax <= 1 ? parsedMax : 1;
    setMaxOverdoneScore(initialMaxOverdone);

    setRestoredFromLastSearch(false);

    // Restore from URL params if present
    if (urlQuery) {
      setQuery(urlQuery);
      setFilters(urlFilters);

      // Try to restore results from sessionStorage (fast, no API call)
      const storageKey = `search_results_${urlQuery}_${JSON.stringify(urlFilters)}_${initialMaxOverdone}`;
      const cachedResults = sessionStorage.getItem(storageKey);

      if (cachedResults) {
        try {
          const parsed = JSON.parse(cachedResults) as Monologue[];
          setResults(parsed);
          setTotal(parsed.length);
          setHasSearched(true);
          setRestoredFromLastSearch(false);
          return;
        } catch (e) {
          console.error("Error parsing cached results:", e);
          // If cache is corrupted, perform fresh search
          performSearch(urlQuery, urlFilters, 1, false, initialMaxOverdone);
          return;
        }
      } else {
        // If no cache but URL has query, perform fresh search
        performSearch(urlQuery, urlFilters, 1, false, initialMaxOverdone);
        return;
      }
    }

    // If there is no query in the URL, fall back to the last search
    // stored in sessionStorage so users don't lose expensive results
    // when navigating away and back to /search.
    try {
      const lastSearchRaw = sessionStorage.getItem(LAST_SEARCH_KEY);
      if (lastSearchRaw) {
        const last = JSON.parse(lastSearchRaw) as {
          query: string;
          filters: typeof filters & { exclude_overdone?: string; max_overdone_score?: number };
          results: Monologue[];
        };
        setQuery(last.query);
        setFilters({
          gender: last.filters.gender ?? "",
          age_range: last.filters.age_range ?? "",
          emotion: last.filters.emotion ?? "",
          theme: last.filters.theme ?? "",
          category: last.filters.category ?? "",
        });
        const m = last.filters.max_overdone_score;
        setMaxOverdoneScore(typeof m === "number" && m >= 0 && m <= 1 ? m : last.filters.exclude_overdone === "true" ? 0.3 : 1);
        setResults(last.results);
        setTotal(last.results.length);
        setHasSearched(last.results.length > 0);
         // These results were restored from the generic "last search" slot.
        setRestoredFromLastSearch(true);
      }
    } catch (e) {
      console.error("Error restoring last search state:", e);
    }
  }, [searchParams]);

  // Auto-open monologue from URL on mount (e.g. shared link /search?m=123)
  const didAutoOpenRef = useRef(false);
  useEffect(() => {
    if (didAutoOpenRef.current) return;
    const mId = searchParams.get("m");
    if (!mId) return;
    const id = parseInt(mId, 10);
    if (isNaN(id)) return;
    didAutoOpenRef.current = true;
    api.get<Monologue>(`/api/monologues/${id}`)
      .then((res) => setSelectedMonologue(res.data))
      .catch(() => {});
  }, []);

  type SearchResponseShape = {
    results: Monologue[];
    total: number;
    page: number;
    page_size: number;
  };

  const performSearch = async (
    searchQuery: string,
    searchFilters: typeof filters,
    pageNum: number = 1,
    append: boolean = false,
    maxOverdoneScoreOverride?: number
  ) => {
    const effectiveMaxOverdone = maxOverdoneScoreOverride ?? maxOverdoneScore;
    if (!append) {
      setIsLoading(true);
      setSearchError(null);
      setSearchUpgradeUrl(null);
    } else {
      setIsLoadingMore(true);
    }
    setHasSearched(true);
    setRestoredFromLastSearch(false);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(pageNum) });
      if (searchQuery.trim()) params.set("q", searchQuery);
      Object.entries(searchFilters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      if (effectiveMaxOverdone < 1) params.set("max_overdone_score", String(effectiveMaxOverdone));

      const response = await api.get<SearchResponseShape>(
        `/api/monologues/search?${params.toString()}`,
        { timeoutMs: 180000 }
      );
      const data = response.data;
      const newResults = data.results;

      if (append) {
        setResults((prev) => [...prev, ...newResults]);
      } else {
        setResults(newResults);
      }
      setTotal(data.total);
      setPage(data.page);
      setHasMore(newResults.length === PAGE_SIZE && newResults.length < data.total);

      // Cache results (first page only) in sessionStorage keyed by query+filters
      if (pageNum === 1) {
        const storageKey = `search_results_${searchQuery}_${JSON.stringify(searchFilters)}_${effectiveMaxOverdone}`;
        sessionStorage.setItem(storageKey, JSON.stringify(newResults));
        const savedFilters = { ...searchFilters, max_overdone_score: effectiveMaxOverdone };
        sessionStorage.setItem(
          LAST_SEARCH_KEY,
          JSON.stringify({
            query: searchQuery,
            filters: savedFilters,
            results: newResults,
          })
        );
        addSearchToHistory({
          query: searchQuery,
          filters: savedFilters,
          resultPreviews: newResults.slice(0, 3),
          resultCount: data.total,
        });
        const newParams = new URLSearchParams();
        if (searchQuery) newParams.set("q", searchQuery);
        Object.entries(searchFilters).forEach(([key, value]) => {
          if (value) newParams.set(key, value);
        });
        if (effectiveMaxOverdone < 1) newParams.set("max_overdone_score", String(effectiveMaxOverdone));
        router.replace(`/search?${newParams.toString()}`, { scroll: false });
      }
    } catch (error: unknown) {
      const res = (error as { response?: { data?: { detail?: string | { message?: string; upgrade_url?: string } } } })?.response;
      const raw = res?.data?.detail;
      const message =
        typeof raw === "string"
          ? raw
          : raw && typeof raw === "object" && "message" in raw
            ? (raw as { message: string }).message
            : error instanceof Error
              ? error.message
              : "Search failed. Please try again.";
      const upgradeUrl = raw && typeof raw === "object" && "upgrade_url" in raw ? (raw as { upgrade_url: string }).upgrade_url : null;
      setSearchError(message);
      setSearchUpgradeUrl(upgradeUrl ?? null);
      if (!append) setResults([]);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const loadMore = () => {
    const hasQueryOrFilters = query.trim() !== "" || Object.entries(filters).some(([, v]) => v !== "") || maxOverdoneScore < 1;
    if (!hasQueryOrFilters || isLoadingMore || !hasMore) return;
    performSearch(query, filters, page + 1, true);
  };

  const handleSearch = async () => {
    const hasQueryOrFilters = query.trim() !== "" || Object.entries(filters).some(([, v]) => v !== "") || maxOverdoneScore < 1;
    if (!hasQueryOrFilters) {
      setJitter(true);
      return;
    }
    await performSearch(query, filters);
  };

  const handleFindForMe = async () => {
    setIsLoading(true);
    setHasSearched(true);
    setQuery(""); // Clear query to show it's AI-based
    setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "" }); // Clear filters

    try {
      const response = await api.get<Monologue[]>("/api/monologues/recommendations?limit=20");
      setResults(response.data);

      // Persist AI "Find for me" results as the last search so that
      // navigating away and back to /search keeps them visible.
      sessionStorage.setItem(
        LAST_SEARCH_KEY,
        JSON.stringify({
          query: "",
          filters: { gender: "", age_range: "", emotion: "", theme: "", category: "" },
          results: response.data,
        })
      );

      // Update URL to reflect AI search
      router.replace("/search?ai=true", { scroll: false });
    } catch (error: any) {
      console.error("Find For Me error:", error);
      if (error.response?.status === 400) {
        // Profile incomplete - show helpful message
        alert("Please complete your actor profile to use AI-powered recommendations. Go to Profile to add your details.");
      }
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const openMonologue = async (mono: Monologue) => {
    setSelectedMonologue(mono);
    setIsLoadingDetail(true);
    // Reflect the open monologue in the URL so it's shareable
    const params = new URLSearchParams(searchParams.toString());
    params.set("m", mono.id.toString());
    router.replace(`/search?${params.toString()}`, { scroll: false });
    try {
      // Fetch full details
      const response = await api.get<Monologue>(`/api/monologues/${mono.id}`);
      setSelectedMonologue(response.data);
    } catch (error) {
      console.error("Error fetching monologue:", error);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeMonologue = () => {
    setSelectedMonologue(null);
    setIsReadingMode(false);
    setShowDownloadMenu(false);
    // Remove ?m from URL
    const params = new URLSearchParams(searchParams.toString());
    params.delete("m");
    const newUrl = params.toString() ? `/search?${params.toString()}` : "/search";
    router.replace(newUrl, { scroll: false });
  };

  const downloadMonologue = (mono: Monologue, format: 'text' | 'pdf' = 'text') => {
    if (format === 'text') {
      const content = `MONOLOGUE: ${mono.character_name}
From: ${mono.play_title} by ${mono.author}

${mono.scene_description ? `SCENE DESCRIPTION:\n${mono.scene_description}\n\n` : ''}MONOLOGUE TEXT:\n${mono.text}${mono.stage_directions ? `\n\nSTAGE DIRECTIONS:\n${mono.stage_directions}` : ''}

---
Duration: ${Math.floor(mono.estimated_duration_seconds / 60)}:${(mono.estimated_duration_seconds % 60).toString().padStart(2, '0')}
Word Count: ${mono.word_count}
${mono.primary_emotion ? `Primary Emotion: ${mono.primary_emotion}` : ''}
${mono.character_gender ? `Character Gender: ${mono.character_gender}` : ''}
${mono.character_age_range ? `Age Range: ${mono.character_age_range}` : ''}
`;

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${mono.character_name.replace(/\s+/g, '_')}_${mono.play_title.replace(/\s+/g, '_')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // PDF download using browser's print functionality
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${mono.character_name} - ${mono.play_title}</title>
  <style>
    @media print {
      @page {
        margin: 1in;
      }
    }
    body {
      font-family: 'Times New Roman', serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 10px;
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
    }
    h2 {
      font-size: 18px;
      margin-top: 20px;
      margin-bottom: 10px;
      color: #666;
    }
    .metadata {
      font-size: 14px;
      color: #666;
      margin-bottom: 20px;
      padding: 10px;
      background-color: #f5f5f5;
      border-left: 3px solid #333;
    }
    .monologue-text {
      font-size: 16px;
      line-height: 1.8;
      margin: 20px 0;
      white-space: pre-wrap;
      text-align: justify;
    }
    .stage-directions {
      font-style: italic;
      color: #666;
      margin-top: 15px;
      padding: 10px;
      background-color: #f9f9f9;
      border-left: 2px solid #ccc;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ccc;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>${mono.character_name}</h1>
  <div class="metadata">
    <strong>From:</strong> ${mono.play_title} by ${mono.author}<br>
    ${mono.character_gender ? `<strong>Character Gender:</strong> ${mono.character_gender}<br>` : ''}
    ${mono.character_age_range ? `<strong>Age Range:</strong> ${mono.character_age_range}<br>` : ''}
    ${mono.primary_emotion ? `<strong>Primary Emotion:</strong> ${mono.primary_emotion}<br>` : ''}
    <strong>Duration:</strong> ${Math.floor(mono.estimated_duration_seconds / 60)}:${(mono.estimated_duration_seconds % 60).toString().padStart(2, '0')}<br>
    <strong>Word Count:</strong> ${mono.word_count}
  </div>
  
  ${mono.scene_description ? `<h2>Scene Description</h2><p class="stage-directions">${mono.scene_description}</p>` : ''}
  
  <h2>Monologue</h2>
  <div class="monologue-text">${mono.text.replace(/\n/g, '<br>')}</div>
  
  ${mono.stage_directions ? `<div class="stage-directions"><strong>Stage Directions:</strong> ${mono.stage_directions}</div>` : ''}
  
  <div class="footer">
    <p>Downloaded from ActorRise</p>
  </div>
  
  <script>
    window.onload = function() {
      window.print();
      setTimeout(() => window.close(), 100);
    };
  </script>
</body>
</html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  };

  const toggleFavorite = async (e: React.MouseEvent, mono: Monologue) => {
    e.stopPropagation();
    // Store previous state for rollback on error
    const previousResults = results;
    const previousSelected = selectedMonologue;

    try {
      if (mono.is_favorited) {
        // Optimistic update: immediately unfavorite in UI
        setResults(results.map(m => m.id === mono.id ? { ...m, is_favorited: false, favorite_count: m.favorite_count - 1 } : m));
        if (selectedMonologue?.id === mono.id) {
          setSelectedMonologue({ ...selectedMonologue, is_favorited: false, favorite_count: selectedMonologue.favorite_count - 1 });
        }
        await api.delete(`/api/monologues/${mono.id}/favorite`);
        toast.success("Removed from bookmarks");
      } else {
        // Optimistic update: immediately favorite in UI
        setResults(results.map(m => m.id === mono.id ? { ...m, is_favorited: true, favorite_count: m.favorite_count + 1 } : m));
        if (selectedMonologue?.id === mono.id) {
          setSelectedMonologue({ ...selectedMonologue, is_favorited: true, favorite_count: selectedMonologue.favorite_count + 1 });
        }
        await api.post(`/api/monologues/${mono.id}/favorite`);
        toast.success("Added to bookmarks");
      }
    } catch (error) {
      // Rollback on error
      setResults(previousResults);
      setSelectedMonologue(previousSelected);
      toast.error("Couldn't update bookmark. Please try again.");
      console.error("Error toggling favorite:", error);
    }
  };

  const activeFilters = Object.entries(filters).filter(([, value]) => value !== "");
  const hasFreshnessFilter = maxOverdoneScore < 1;
  const getFilterDisplay = (key: string, value: string) => `${key.replace(/_/g, " ")}: ${value}`;
  const getFreshnessLabel = (score: number) =>
    score <= 0 ? "Freshest only" : score <= 0.3 ? "Fresh" : score <= 0.5 ? "Some overdone OK" : score <= 0.7 ? "More OK" : "Show all";
  const canSearch = query.trim() !== "" || activeFilters.length > 0 || hasFreshnessFilter;

  // Sort by confidence score (desc). Best match = only actual quote matches (exact_quote/fuzzy_quote); rest are related.
  const HIGH_SCORE_CAP_FOR_CONFIDENCE = 5; // If more than this many have score >= 0.70, treat as broad query and hide confidence
  const { bestMatches, relatedResults, showConfidence } = useMemo(() => {
    const sorted = [...results].sort(
      (a, b) => (b.relevance_score ?? -1) - (a.relevance_score ?? -1)
    );
    const scores = sorted
      .map((r) => r.relevance_score)
      .filter((s): s is number => s != null && s > 0.1);
    const highCount = scores.filter((s) => s >= 0.70).length;
    const showConf = scores.length > 0 && highCount <= HIGH_SCORE_CAP_FOR_CONFIDENCE;

    const best: Monologue[] = [];
    const related: Monologue[] = [];
    for (const mono of sorted) {
      if (showConf && (mono.match_type === "exact_quote" || mono.match_type === "fuzzy_quote")) {
        best.push(mono);
      } else {
        related.push(mono);
      }
    }

    return {
      bestMatches: best,
      relatedResults: related,
      showConfidence: showConf,
    };
  }, [results]);

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
      {/* Hero Search Section - compact on mobile */}
      <div className="mb-6 md:mb-10">
        <div className="text-center mb-4 md:mb-8">
          <p className="hidden md:inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-primary mb-4">
            <IconSparkles className="h-3 w-3" />
            AI-Powered Search
          </p>
          <h1 className="text-2xl md:text-5xl font-bold tracking-tight mb-1 md:mb-3">Find your next piece</h1>
          <p className="hidden md:block text-muted-foreground text-lg max-w-xl mx-auto">
            Describe what you&apos;re looking for in plain English; filters narrow results or let you browse by criteria.
          </p>
        </div>

        {/* Search Bar - stacked on mobile for easier tap targets */}
        <div className="max-w-3xl mx-auto">
          <div className="relative group">
            {/* Ambient glow effect - subtle background */}
            <div
              className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-primary/0 via-primary/30 to-primary/0 blur-lg transition-all duration-500 ${
                isTyping ? "opacity-100 scale-105" : "opacity-0 scale-100"
              }`}
            />

            {/* Sweeping spotlight overlay */}
            <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
              <div
                className={`absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent transition-transform duration-700 ease-out ${
                  isTyping ? "translate-x-full" : "-translate-x-full"
                }`}
              />
            </div>

            <div
              className={`relative flex flex-col md:flex-row md:items-center gap-2 p-2 bg-card border rounded-xl shadow-sm transition-all duration-300 ${
                isTyping ? "border-primary/50 shadow-lg shadow-primary/5" : "border-border"
              } ${jitter ? "search-jitter" : ""}`}
              onAnimationEnd={() => setJitter(false)}
            >
              <div className="flex-1 relative min-w-0 w-full">
                <IconSearch className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 transition-colors duration-300 ${
                  isTyping ? "text-primary" : "text-muted-foreground"
                }`} />
                <Input
                  id="search-input"
                  placeholder="e.g. funny piece, 2 min..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setIsTyping(true);
                    if (typingTimeoutRef.current) {
                      clearTimeout(typingTimeoutRef.current);
                    }
                    typingTimeoutRef.current = setTimeout(() => {
                      setIsTyping(false);
                    }, 800);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  onFocus={() => query && setIsTyping(true)}
                  onBlur={() => setTimeout(() => setIsTyping(false), 200)}
                  className="pl-12 pr-10 min-h-[48px] md:h-12 text-base border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                    aria-label="Clear search"
                  >
                    <IconX className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                onClick={handleSearch}
                disabled={isLoading}
                size="lg"
                className={`w-full md:w-auto min-h-[48px] md:min-h-[2.5rem] px-6 rounded-lg transition-all duration-300 ${
                  isTyping ? "shadow-md shadow-primary/20" : ""
                }`}
              >
                {isLoading ? (
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Search"
                )}
              </Button>
            </div>
          </div>

          {/* Action Row - Filters + Find for me; Submit monologue hidden on mobile (in Account/hamburger) */}
          <div id="search-filters" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Mobile: Filters open bottom sheet */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFiltersSheet(true)}
                className="md:hidden gap-2 text-muted-foreground hover:text-foreground min-h-[44px]"
              >
                <IconAdjustments className="h-4 w-4" />
                Filters
                {(activeFilters.length > 0 || hasFreshnessFilter) && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {activeFilters.length + (hasFreshnessFilter ? 1 : 0)}
                  </Badge>
                )}
              </Button>
              {/* Desktop: Filters toggle inline panel */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={`hidden md:flex gap-2 text-muted-foreground hover:text-foreground ${showFilters ? "text-foreground bg-muted" : ""}`}
              >
                <IconAdjustments className="h-4 w-4" />
                Filters
                {(activeFilters.length > 0 || hasFreshnessFilter) && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {activeFilters.length + (hasFreshnessFilter ? 1 : 0)}
                  </Badge>
                )}
              </Button>
              <Link
                href="/submit-monologue"
                className="hidden md:inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <IconSend className="h-4 w-4" />
                Submit monologue
              </Link>
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    id="search-find-for-me"
                    onClick={handleFindForMe}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                    className="gap-2 min-h-[44px] md:min-h-0"
                  >
                    <IconSparkles className="h-4 w-4 text-primary" />
                    Find for me
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">
                    Get AI-powered recommendations based on your actor profile.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Mobile: filters in sheet (SearchFiltersSheet). Desktop: expandable inline filters */}
          <SearchFiltersSheet
            open={showFiltersSheet}
            onOpenChange={setShowFiltersSheet}
            filters={filters}
            setFilters={setFilters}
            maxOverdoneScore={maxOverdoneScore}
            setMaxOverdoneScore={setMaxOverdoneScore}
          />

          {selectedMonologue && (
            <ReportMonologueModal
              open={reportOpen}
              onOpenChange={setReportOpen}
              monologueId={selectedMonologue.id}
              characterName={selectedMonologue.character_name}
              playTitle={selectedMonologue.play_title}
            />
          )}

          {/* Expandable Filters - desktop only */}
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="hidden md:block mt-4 p-4 bg-card border border-border rounded-lg"
            >
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { key: "gender", label: "Gender", options: ["male", "female", "any"] },
                  { key: "age_range", label: "Age Range", options: ["teens", "20s", "30s", "40s", "50s", "60+"] },
                  { key: "emotion", label: "Emotion", options: ["joy", "sadness", "anger", "fear", "melancholy", "hope"] },
                  { key: "theme", label: "Theme", options: ["love", "death", "betrayal", "identity", "power", "revenge"] },
                  { key: "category", label: "Category", options: ["classical", "contemporary"] },
                ].map(({ key, label, options }) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <select
                      value={filters[key as keyof typeof filters]}
                      onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background"
                    >
                      <option value="">Any</option>
                      {options.map(opt => (
                        <option key={opt} value={opt} className="capitalize">{opt}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Freshness – separate from category filters, aligned with actor profile UX */}
              <div className="mt-4 pt-4 border-t border-border/80">
                <div className="flex items-center gap-2 mb-2">
                  <Label className="text-xs text-muted-foreground font-medium">Freshness</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-sm" aria-label="Freshness filter info">
                        <IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">
                        Filter by how &quot;overdone&quot; a piece is (often used in auditions). Lower = only fresher, less common pieces; higher = include well-known ones.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={maxOverdoneScore}
                    onChange={(e) => setMaxOverdoneScore(parseFloat(e.target.value))}
                    className="flex-1 h-2 rounded-lg appearance-none bg-muted accent-primary"
                  />
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{getFreshnessLabel(maxOverdoneScore)}</span>
                </div>
              </div>

              {(activeFilters.length > 0 || hasFreshnessFilter) && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                  {activeFilters.map(([key, value]) => (
                    <Badge key={key} variant="secondary" className="gap-1 capitalize">
                      {getFilterDisplay(key, value)}
                      <button
                        onClick={() => setFilters({ ...filters, [key]: "" })}
                        className="ml-1 hover:text-destructive"
                      >
                        <IconX className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {hasFreshnessFilter && (
                    <Badge variant="secondary" className="gap-1">
                      Freshness: {getFreshnessLabel(maxOverdoneScore)}
                      <button
                        onClick={() => setMaxOverdoneScore(1)}
                        className="ml-1 hover:text-destructive"
                      >
                        <IconX className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  <button
                    onClick={() => { setFilters({ gender: "", age_range: "", emotion: "", theme: "", category: "" }); setMaxOverdoneScore(1); }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      <div className="space-y-6">

        {/* Error banner with retry */}
        {searchError && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-4 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-destructive font-medium">{searchError}</p>
                {searchUpgradeUrl && (
                  <Link href={searchUpgradeUrl}>
                    <Button variant="default" size="sm">View plans & upgrade</Button>
                  </Link>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => { setSearchError(null); setSearchUpgradeUrl(null); performSearch(query, filters); }}>
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-16"
            >
              {/* Fun Loading State */}
              <div className="flex flex-col items-center justify-center gap-6 mb-12">
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
                  {currentLoadingMessage}
                </motion.p>
              </div>

              {/* Skeleton cards */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="opacity-50">
                    <CardContent className="pt-6 space-y-4">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          ) : hasSearched && results.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center">
                <IconSearch className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No monologues found</h3>
                <p className="text-sm text-muted-foreground">
                  Try different search terms or adjust filters
                </p>
              </CardContent>
            </Card>
          ) : results.length > 0 ? (
            <div id="search-results" className="space-y-4">
              {searchParams.get("ai") === "true" && (
                <div className="flex items-center gap-2 p-4 bg-secondary/10 border border-secondary/30 rounded-lg">
                  <IconSparkles className="h-5 w-5 text-accent flex-shrink-0" />
                  <p className="text-sm font-medium text-secondary-foreground">
                    AI-powered recommendations based on your profile
                  </p>
                </div>
              )}
              {query.trim() && (activeFilters.length > 0 || hasFreshnessFilter) && (
                  <p className="text-sm text-muted-foreground">
                  Showing monologues matching <span className="font-semibold text-foreground">&ldquo;{query}&rdquo;</span>
                  {" in "}
                  {[...activeFilters.map(([k, v]) => getFilterDisplay(k, v)), ...(hasFreshnessFilter ? [`Freshness: ${getFreshnessLabel(maxOverdoneScore)}`] : [])].join("; ")}. Filters narrow the set; search ranks by meaning.
                  </p>
                )}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {showBookmarkedOnly ? (
                    <>
                      Showing <span className="font-semibold">
                        {results.filter((m) => m.is_favorited).length}
                      </span> bookmarked monologues
                    </>
                  ) : (
                    <>
                      Found <span className="font-semibold">{total > 0 ? total : results.length}</span> monologues
                    </>
                  )}
                </p>
                <Button
                  variant={showBookmarkedOnly ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                  className="gap-2 rounded-full"
                >
                  <IconBookmark className={`h-4 w-4 ${showBookmarkedOnly ? "fill-current" : ""}`} />
                  Bookmarked only
                </Button>
              </div>
              {restoredFromLastSearch && searchParams.get("q") === null && (
                <p className="text-[11px] text-muted-foreground/80">
                  Showing results from your last search. New searches will update this list.
                </p>
              )}

              {/* Unified results grid: Best Match + Related use same card layout; hide confidence for broad queries */}
              {(() => {
                const relatedOrBookmarked = showBookmarkedOnly ? results.filter((m) => m.is_favorited) : relatedResults;
                const hasCards = (!showBookmarkedOnly && bestMatches.length > 0) || relatedOrBookmarked.length > 0;
                if (!hasCards) return null;
                const showBadges = showConfidence && !showBookmarkedOnly;
                return (
                  <>
                    {!showBookmarkedOnly && showConfidence && bestMatches.length > 0 && (
                      <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/20">
                          <IconTargetArrow className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-foreground">This is the monologue</h2>
                          <p className="text-sm text-muted-foreground">We found the piece that contains your quote</p>
                        </div>
                      </div>
                    )}
                    {!showBookmarkedOnly && !showConfidence && relatedOrBookmarked.length > 0 && (
                      <p className="text-sm text-muted-foreground mb-4">Sorted by relevance</p>
                    )}
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {!showBookmarkedOnly && bestMatches.map((mono, idx) => (
                        <MonologueResultCard
                          key={mono.id}
                          mono={mono}
                          onSelect={() => openMonologue(mono)}
                          onToggleFavorite={toggleFavorite}
                          variant="bestMatch"
                          index={idx}
                          showMatchBadge={showBadges}
                        />
                      ))}
                      {relatedOrBookmarked.map((mono, idx) => (
                        <MonologueResultCard
                          key={mono.id}
                          mono={mono}
                          onSelect={() => openMonologue(mono)}
                          onToggleFavorite={toggleFavorite}
                          variant="default"
                          index={(!showBookmarkedOnly ? bestMatches.length : 0) + idx}
                          showMatchBadge={showBadges}
                        />
                      ))}
                    </div>
                  </>
                );
              })()}
              {hasMore && !showBookmarkedOnly && (
                <div className="flex justify-center pt-6">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="rounded-full px-8"
                  >
                    {isLoadingMore ? (
                      <IconLoader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Load more
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Slide-over Detail Panel - Backstage.com Style */}
      <AnimatePresence>
        {selectedMonologue && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: isReadingMode ? 0.95 : 0.5 }}
              exit={{ opacity: 0 }}
              onClick={closeMonologue}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`fixed inset-0 z-[10000] ${
                isReadingMode ? "bg-black/95" : "bg-black/50"
              }`}
            />

            {/* Slide-over Panel */}
            <motion.div
              ref={panelRef}
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ 
                duration: 0.3,
                ease: "easeOut",
                opacity: { duration: 0.25 }
              }}
              className={`fixed right-0 top-0 bottom-0 z-[10001] overflow-y-auto transition-all ${
                isReadingMode
                  ? "w-full bg-background"
                  : "w-full md:w-[600px] lg:w-[700px] bg-background border-l shadow-2xl"
              }`}
            >
              <div className={`sticky top-0 bg-background/95 backdrop-blur-sm border-b z-[10002] ${
                isReadingMode ? "border-b-0" : ""
              }`}>
                <div className="flex items-center justify-between p-6">
                  {!isReadingMode && <h2 className="hidden sm:block text-2xl font-bold">Monologue Details</h2>}
                  {(!isReadingMode || isReadingMode) && <div className="flex-1 sm:hidden" />}
                  <div className="flex items-center gap-2">
                    {/* Download button - show in both modes; 44px touch target on mobile */}
                    <div className="relative z-[10002]">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDownloadMenu(!showDownloadMenu);
                        }}
                        className="hover:bg-muted relative z-[10002] min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
                        title="Download monologue"
                      >
                        <IconDownload className="h-5 w-5" />
                      </Button>
                      {showDownloadMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-[10003]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDownloadMenu(false);
                            }}
                          />
                          <div className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg p-1 min-w-[140px] z-[10004]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadMonologue(selectedMonologue, 'text');
                                setShowDownloadMenu(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-lg transition-colors"
                            >
                              Download as TXT
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadMonologue(selectedMonologue, 'pdf');
                                setShowDownloadMenu(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-lg transition-colors"
                            >
                              Download as PDF
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {!isReadingMode && (
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          toggleFavorite(e, selectedMonologue);
                        }}
                        className={`relative z-[10002] active:scale-95 transition-transform min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 ${
                          selectedMonologue.is_favorited
                            ? "bg-violet-500/15 hover:bg-violet-500/25 text-violet-500 dark:text-violet-400"
                            : "hover:bg-violet-500/15 hover:text-violet-500 text-muted-foreground"
                        }`}
                        aria-label={selectedMonologue.is_favorited ? "Remove bookmark" : "Add bookmark"}
                      >
                        <IconBookmark
                          className={`h-5 w-5 ${selectedMonologue.is_favorited ? "fill-current" : ""}`}
                        />
                      </Button>
                    )}
                    {!isReadingMode && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReportOpen(true);
                        }}
                        className="hover:bg-muted relative z-[10002] min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 text-muted-foreground hover:text-foreground"
                        title="Report an issue"
                        aria-label="Report an issue with this monologue"
                      >
                        <IconFlag className="h-5 w-5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsReadingMode(!isReadingMode);
                      }}
                      className="hover:bg-muted relative z-[10002] min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
                    >
                      {isReadingMode ? (
                        <IconEyeOff className="h-5 w-5" />
                      ) : (
                        <IconEye className="h-5 w-5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={closeMonologue}
                      className="relative z-[10002] min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
                    >
                      <IconX className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className={`${isReadingMode ? "max-w-4xl mx-auto" : ""} p-6 space-y-6`}>
                {isLoadingDetail ? (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-64 w-full" />
                  </div>
                ) : isReadingMode ? (
                  /* Reading Mode - Centered and Focused */
                  <div className="space-y-8 py-12">
                    {/* Minimal Header */}
                    <div className="text-center space-y-2">
                      <h1 className="text-4xl font-bold font-typewriter">{selectedMonologue.character_name}</h1>
                      <div>
                        <p className="text-xl font-semibold font-typewriter text-muted-foreground">{selectedMonologue.play_title}</p>
                        <p className="text-muted-foreground font-typewriter">by {selectedMonologue.author}</p>
                      </div>
                    </div>

                    {/* Monologue Text - Large and Centered */}
                    <div className="bg-background p-8 rounded-lg">
                      <p className="text-xl leading-relaxed font-typewriter max-w-3xl mx-auto text-center">
                        <MonologueText text={selectedMonologue.text} />
                      </p>
                    </div>
                  </div>
                ) : (
                  <MonologueDetailContent
                    monologue={selectedMonologue}
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSearchTour && (
          <SearchTour onDismiss={async () => { setShowSearchTour(false); await refreshUser(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}
